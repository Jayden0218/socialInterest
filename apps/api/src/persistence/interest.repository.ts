import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';
import { InterestNameClaimRepository } from './interest-name-claim.repository';
import type { TransactionItems } from './transactor';

export interface InterestItem {
  interestId: string;
  name: string;
  nameNormalised: string;
  slug: string;
  /**
   * 013/T010. `level: 'top' | 'sub'` and `parentId?: string` are GONE.
   *
   * Deleted rather than defaulted. 006's rule, proved when the `theme.color.*`
   * shim was removed rather than left exported: a name that does not exist is a
   * typecheck failure the moment somebody writes it again, which is a stronger
   * guard than a test and costs nothing to keep. A `parentId` left on the item
   * as `undefined` is an invitation to re-grow the hierarchy.
   */
  createdBy: string;
  description?: string;
  /** 004/FR-025. Only the SET half shipped in 001; this is the edit half. */
  descriptionUpdatedAt?: string;
  postCount: number;
  followerCount: number;
  state: 'active' | 'merging' | 'merged' | 'retired';
  mergedIntoId?: string;
  createdAt: string;
}

/** Access patterns A12 (by id/slug), A13 (children), A14 (whole catalogue). */
@Injectable()
export class InterestRepository extends BaseRepository {
  async findById(interestId: string): Promise<InterestItem | null> {
    return this.getItem<InterestItem>(keys.interest(interestId));
  }

  /**
   * FR-022 / FR-023. The catalogue cache is checked first for a friendly
   * duplicate response, but the cache can be stale by microseconds under
   * concurrent creation - so the write itself is conditional on the item not
   * existing. The uniqueness that matters is enforced here, not in memory.
   */
  /** 004/FR-025. Edit, as distinct from set-at-creation. */
  async setDescription(interestId: string, description: string, now: string): Promise<void> {
    await this.updateItem(keys.interest(interestId), {
      description,
      descriptionUpdatedAt: now,
    });
  }

  /**
   * 013/T005. CREATE, WITH THE NAME AND SLUG CLAIMED IN THE SAME TRANSACTION.
   *
   * Renamed from `createSubInterest` because there are no sub-interests.
   *
   * THE OLD CONDITION IS STILL HERE AND STILL PROVES NOTHING ABOUT A NAME.
   * `attribute_not_exists(pk)` on `INTEREST#<interestId>` guards against writing
   * the same interest twice, which nothing was trying to do — `interestId` is a
   * fresh ULID on every call. It is kept because it is correct, and noted
   * because it is the thing that LOOKED like the constraint: measured at eight
   * of eight simultaneous creations of one name succeeding, identical to 011's
   * handles. The claims below are the actual constraint.
   *
   * `extraItems` lets publishing put the post in the same transaction (T013), so
   * an interest cannot exist without one.
   */
  /**
   * 013/T013. The items that bring an interest into existence, for a caller
   * that is writing something else in the same transaction — publishing, which
   * must create the interest and the post together or neither (FR-004).
   */
  createItems(item: InterestItem): TransactionItems {
    return [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.interest(item.interestId),
            ...keys.interestBySlug(item.slug),
            ...keys.interestCatalogue(item.nameNormalised),
            type: 'Interest',
            ...item,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      InterestNameClaimRepository.claimItem(item.nameNormalised, item.interestId, this.tableName),
      InterestNameClaimRepository.slugClaimItem(item.slug, item.interestId, this.tableName),
    ];
  }

  async create(item: InterestItem, extraItems: TransactionItems = []): Promise<void> {
    await this.transact([...this.createItems(item), ...extraItems]);
  }

  /** Atomic counter - no read-modify-write, so concurrent follows cannot race. */
  async incrementFollowerCount(interestId: string, by: number): Promise<void> {
    await this.increment(keys.interest(interestId), 'followerCount', by);
  }

  async incrementPostCount(interestId: string, by: number): Promise<void> {
    await this.increment(keys.interest(interestId), 'postCount', by);
  }

  private async rewrite(interestId: string, patch: Partial<InterestItem>): Promise<void> {
    const existing = await this.findById(interestId);
    if (!existing) throw new Error(`interest ${interestId} not found`);
    const updated = { ...existing, ...patch };
    await this.putItem({
      ...keys.interest(interestId),
      ...keys.interestBySlug(updated.slug),
      ...keys.interestCatalogue(updated.nameNormalised),
      type: 'Interest',
      ...updated,
    });
  }

  async setState(interestId: string, state: InterestItem['state']): Promise<void> {
    await this.rewrite(interestId, { state });
  }

  async setMergedInto(interestId: string, mergedIntoId: string): Promise<void> {
    await this.rewrite(interestId, { state: 'merged', mergedIntoId });
  }

  /**
   * 013/T010. `setParent` IS GONE.
   *
   * Re-parenting an interest is meaningless once interests are flat, and the
   * merge job's `reparent` branch went with it. Deleted rather than left
   * throwing: a method that exists is a method somebody calls.
   */

  async findBySlug(slug: string): Promise<InterestItem | null> {
    const page = await this.query<InterestItem>(`ISLUG#${slug}`, { indexName: 'gsi1', limit: 1 });
    return page.items[0] ?? null;
  }

  /** A13. `null` parent lists the curated top level. */
  /**
   * 013. LOADS EVERY INTEREST, FLAT — and the way this broke is the feature's
   * own failure mode, which is worth recording where it happened.
   *
   * It read `listChildren(null)` for the top level and then `listChildren(top)`
   * for each of those, walking the hierarchy through a `PARENT#` index that
   * 013/T003 deleted. Flat interests are under no parent, so the walk returned
   * NOTHING: the catalogue cache loaded empty, `findSimilar` had nothing to
   * compare against, and the duplicate gate accepted every near-duplicate.
   *
   * Exactly the shape FR-008 exists for — the gate failing OPEN in silence —
   * arriving through the loader instead of the comparison. Nothing errored; an
   * integration test caught it because it published a near-duplicate and got
   * 201 where it wanted 409.
   *
   * AND THE UNIT GUARD COULD NOT HAVE CAUGHT IT: `interest-similarity-is-global`
   * stubs `loadAll`, so it proves the comparison is global and is structurally
   * blind to the loader feeding it. That is 007's `ApiPage<T>` defect in
   * miniature — a stub agreeing with the test rather than with the datastore.
   *
   * A14 stays cheap: one scan of the interest partition, which the cache already
   * held entirely in memory.
   */
  /** 013. One page of the flat catalogue, by name. Replaces `listChildren`. */
  async listAll(opts: { limit?: number; cursor?: string | null } = {}): Promise<Page<InterestItem>> {
    return this.query<InterestItem>('ICATALOGUE', {
      indexName: 'gsi3',
      ascending: true,
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? null,
    });
  }

  async loadAll(): Promise<InterestItem[]> {
    const out: InterestItem[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<InterestItem> = await this.query<InterestItem>('ICATALOGUE', {
        indexName: 'gsi3',
        ascending: true,
        limit: 200,
        cursor,
      });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }
}
