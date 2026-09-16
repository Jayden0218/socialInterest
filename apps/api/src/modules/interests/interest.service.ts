import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { InterestRepository, type InterestItem } from '../../persistence/interest.repository';
import type { TransactionItems } from '../../persistence/transactor';
import { InMemoryCatalogueCache, normaliseName } from './catalogue.cache';
import { NamePolicy } from './name-policy';
import { InterestSearch, type SearchResult } from './catalogue.search';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';

export interface CreateSubInterestInput {
  name: string;
  parentId: string;
  description?: string;
  createdBy: string;
  /** Ids the person was shown as near-duplicates and chose to proceed past. */
  acknowledgedSimilarTo?: string[];
}

export class DuplicateInterestError extends DomainError {
  constructor(readonly candidates: SearchResult[]) {
    super(
      HttpStatus.CONFLICT,
      'A similar interest already exists',
      'Join the existing interest, or choose a more distinct name.',
    );
  }
}

@Injectable()
export class InterestService {
  constructor(
    @Inject(InterestRepository) private readonly repo: InterestRepository,
    @Inject(InMemoryCatalogueCache) private readonly cache: InMemoryCatalogueCache,
    @Inject(NamePolicy) private readonly namePolicy: NamePolicy,
    @Inject(InterestSearch) private readonly search: InterestSearch,
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
  ) {}

  /**
   * 013/FR-004. `createSubInterest` AND `POST /v1/interests` ARE BOTH GONE.
   *
   * It wrote `postCount: 0`, which is the state FR-004 makes unrepresentable:
   * an interest comes into existence only as part of publishing a post into it.
   * `resolveOrPrepare` below replaces it — same name policy, same duplicate
   * gate, same claim rows — but it returns transaction items for the CALLER
   * instead of writing on its own, so the interest and the post that justifies
   * it land together or not at all.
   */

  /**
   * 013/T035, FR-022, FR-023. RETIRE AN INTEREST THAT NO POST USES.
   *
   * ────────────────────────────────────────────────────────────────────────
   * IT ASKS THE ROWS, NOT THE COUNTER, AND THAT IS NOT A PREFERENCE
   * ────────────────────────────────────────────────────────────────────────
   *
   * `InterestItem.postCount` looks like the obvious signal and is the wrong
   * one: NOTHING MAINTAINS IT. `incrementPostCount` exists on the repository
   * and has no caller anywhere — publishing into an existing interest never
   * touches it — so it is 1 for every interest ever created and means nothing
   * afterwards. Retiring on `postCount === 0` would retire nothing, for ever,
   * and look implemented.
   *
   * Even maintained it would be the wrong source: 008 deliberately did not copy
   * the conversation `unreadCount` because "a count and the rows it counts are
   * two sources of truth for one fact". The index rows ARE the fact.
   *
   * RETIRED, NOT DELETED, so a link from somewhere the boundary has not
   * re-evaluated leads to a retired interest rather than nowhere.
   *
   * FR-026: it reads the rows RAW, without the viewer's boundary. "Does this
   * interest hold any post at all" is not "does this viewer see one" — asking
   * the second would retire an interest because one person is blocked, which
   * would leak the block to everybody else.
   */
  async retireIfEmpty(interestId: string): Promise<boolean> {
    const interest = this.cache.byId(interestId);
    if (!interest || interest.state !== 'active') return false;

    const page = await this.index.listByInterest(interestId, { limit: 1 });
    if (page.items.length > 0) return false;

    await this.repo.setState(interestId, 'retired');
    await this.cache.refresh();
    return true;
  }

  /** 013/T013. Makes a just-created interest postable and searchable at once. */
  /**
   * The stored interest, counts included.
   *
   * Separate from `CatalogueSearch.byId` on purpose: that one answers from the
   * in-memory index, which is right for a name and wrong for a number nothing
   * refreshes it for. See `interest.controller.ts` § detail.
   */
  async findById(interestId: string): Promise<InterestItem | null> {
    return this.repo.findById(interestId);
  }

  /**
   * Fresh counts for a page of interests, keyed by id.
   *
   * ONE READ PER ROW, BOUNDED BY THE PAGE. The listing serves at most fifty,
   * and 012/FR-032 needs the numbers on it to be true — a tile whose count is
   * whatever the process booted with is exactly the "choosing is guessing" the
   * requirement is about. A batch read here beats the alternative, which is
   * refreshing a whole catalogue on every publish and every follow.
   */
  async countsFor(interestIds: string[]): Promise<Map<string, InterestItem>> {
    const rows = await Promise.all(interestIds.map((id) => this.repo.findById(id)));
    const out = new Map<string, InterestItem>();
    for (const row of rows) if (row) out.set(row.interestId, row);
    return out;
  }

  async refreshCatalogue(): Promise<void> {
    await this.cache.refresh();
  }

  /**
   * 013/T013, FR-004. RESOLVE A NAME, OR PREPARE TO CREATE IT — never write.
   *
   * Returns the interest plus the transaction items that would bring it into
   * existence, so the CALLER (publishing) puts them in the same transaction as
   * the post. That is what makes "an interest cannot exist without a post" true
   * rather than usually true: two requests leave a window in which an empty
   * interest exists, and a publish that fails afterwards leaves one for ever.
   *
   * Contract §1, rows 3, 4 and 7. Rows 1, 2 and 5 throw.
   */
  async resolveOrPrepare(
    name: string,
    createdBy: string,
    acknowledgedSimilarTo?: string[],
  ): Promise<{ interest: InterestItem; items: TransactionItems }> {
    const trimmed = name.trim();
    const nameNormalised = normaliseName(trimmed);

    // Contract §1 row 1. `normaliseName` strips everything outside [a-z0-9], so
    // this also refuses a name written in a non-Latin script — a stated
    // limitation of the product, not an accident of this branch.
    if (!nameNormalised) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Interest name is empty',
        'An interest needs a name with letters or numbers in it.',
      );
    }

    // Row 3: it already exists, in any casing or punctuation. Not a question —
    // asking somebody to confirm that capitalisation does not matter is noise.
    const exact = this.search.findExact(trimmed);
    if (exact) return { interest: exact, items: [] };

    // Row 4: it names something merged away. Land on the survivor rather than
    // resurrect the source.
    const merged = this.cache.byNormalisedName(nameNormalised);
    if (merged?.state === 'merged' && merged.mergedIntoId) {
      const target = this.cache.byId(merged.mergedIntoId);
      if (target && target.state === 'active') return { interest: target, items: [] };
    }

    // Rows 2, 5, 6, 7 — the policy and duplicate gate, in that order: a
    // prohibited name is never compared against the catalogue.
    this.namePolicy.assertAllowed(trimmed);
    const similar = this.search.findSimilar(trimmed);
    const acknowledged = new Set(acknowledgedSimilarTo ?? []);
    const unacknowledged = similar.filter((c) => !acknowledged.has(c.interest.interestId));
    if (this.search.isTooSimilar(unacknowledged)) throw new DuplicateInterestError(unacknowledged);

    const interest: InterestItem = {
      interestId: ulid(),
      name: trimmed,
      nameNormalised,
      slug: await this.uniqueSlug(trimmed),
      createdBy,
      /**
       * ZERO, AND THE SAME TRANSACTION TAKES IT TO ONE.
       *
       * It was written as `1` because FR-004 makes an interest with no posts
       * unrepresentable and nothing maintained the counter — so the literal was
       * standing in for a writer that did not exist. 012/FR-032 gave it one
       * (`post.transaction.ts`, "ADD postCount :one"), and both writes are in
       * the ONE transaction that also writes the post: this row and the
       * increment land together or not at all, so no reader ever sees an
       * interest at zero. Leaving the literal at 1 beside a real increment
       * would have made every interest's first post count twice.
       */
      postCount: 0,
      followerCount: 0,
      state: 'active',
      createdAt: new Date().toISOString(),
    };
    return { interest, items: this.repo.createItems(interest) };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!(await this.repo.findBySlug(base))) return base;
    // Slugs are globally unique while names are unique per parent, so the same
    // name under two parents needs a discriminator.
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}-${i}`;
      if (!(await this.repo.findBySlug(candidate))) return candidate;
    }
    return `${base}-${ulid().slice(-6).toLowerCase()}`;
  }

  /**
   * 004/FR-025, the edit half.
   *
   * Refreshes the catalogue afterwards, because the cache is what every read
   * goes through - a description written to the item and not to the cache would
   * be invisible until the next restart, which is the kind of "saved but not
   * showing" that reads as data loss.
   */
  async setDescription(interestId: string, description: string): Promise<void> {
    await this.repo.setDescription(interestId, description, new Date().toISOString());
    await this.cache.refresh();
  }
}
