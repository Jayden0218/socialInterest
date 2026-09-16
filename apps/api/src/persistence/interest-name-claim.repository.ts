import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import type { TransactionItems } from './transactor';
import { keys } from './keys';
import { normaliseName } from '../modules/interests/normalise-name';

export interface InterestNameClaimItem {
  interestId: string;
  nameNormalised: string;
  claimedAt: string;
}

/**
 * 013/T004. THE ROW THAT MAKES AN INTEREST NAME UNIQUE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MEASURED, NOT REASONED ABOUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `interest-name-uniqueness.spec.ts` was run against the shipped product before
 * this file existed: **eight simultaneous creations of one name, eight accepted,
 * eight interests in the table.**
 *
 * That number is the diagnosis. A read-then-write loses a race occasionally; a
 * reliable 8 means there was no race to lose, because there was no constraint —
 * `InterestRepository.create` guarded `attribute_not_exists(pk)` where `pk` is
 * `INTEREST#<interestId>`, a fresh ULID per call, which can never fire for a
 * NAME. A fix aimed at narrowing a window would have been progress against the
 * wrong diagnosis.
 *
 * This is 011's handle defect in a second place, word for word, and it is fixed
 * the same way — deliberately, because the pattern is settled and a second
 * mechanism for one idea is a second thing to keep true.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WORSE THAN 011's, IN ONE RESPECT WORTH KNOWING
 * ────────────────────────────────────────────────────────────────────────────
 *
 * What stood in for a constraint was `findExact`, which reads `CatalogueCache` —
 * an in-memory, PER-PROCESS cache refreshed after a write. Two API processes do
 * not see each other's new interests until a refresh, so the window was never
 * scheduling microseconds. It was however long the other process's cache was
 * stale. On one local process that is invisible, which is why it never bit.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXPOSES ITEMS RATHER THAN A `claim()` THAT WRITES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A claim written separately from the interest it belongs to has two failure
 * modes, both worse than refusing: an interest without its claim leaves the name
 * free for somebody else, and a claim without the interest burns a name nobody
 * can ever use. The caller puts it in the SAME transaction, and `transact` makes
 * it all-or-none.
 */
@Injectable()
export class InterestNameClaimRepository extends BaseRepository {
  /**
   * Folded HERE, by the same function the catalogue uses.
   *
   * Deliberately imported rather than re-implemented: a claim folded one way and
   * a lookup folding another would defend "Bouldering" while the search resolved
   * "bouldering" — a constraint and a lookup disagreeing about what a name is,
   * which is the shape of every defect in this feature's research.
   */
  static fold(name: string): string {
    return normaliseName(name);
  }

  /** The write, as a transaction item for the caller to include. */
  static claimItem(name: string, interestId: string, tableName: string): TransactionItems[number] {
    const nameNormalised = InterestNameClaimRepository.fold(name);
    const item: InterestNameClaimItem = {
      interestId,
      nameNormalised,
      claimedAt: new Date().toISOString(),
    };
    return {
      Put: {
        TableName: tableName,
        Item: { ...keys.interestNameClaim(nameNormalised), type: 'InterestNameClaim', ...item },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }

  /**
   * 013/T005. The slug claim.
   *
   * `uniqueSlug` probes with `findBySlug` in a loop and then writes — a
   * read-then-write racing exactly as the name did. Claimed in the same
   * transaction, because fixing one half and leaving the other is the
   * declared-half-with-no-other-half shape recorded seven times here.
   */
  static slugClaimItem(slug: string, interestId: string, tableName: string): TransactionItems[number] {
    return {
      Put: {
        TableName: tableName,
        Item: {
          ...keys.interestSlugClaim(slug),
          type: 'InterestSlugClaim',
          interestId,
          slug,
          claimedAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }

  async find(name: string): Promise<InterestNameClaimItem | null> {
    return this.getItem<InterestNameClaimItem>(
      keys.interestNameClaim(InterestNameClaimRepository.fold(name)),
    );
  }

  /**
   * Claims a name on its own. FOR THE BACK-FILL (T006) and nothing else —
   * existing interests were written before this row existed, so there is nothing
   * to write alongside them.
   *
   * Returns false when already claimed rather than throwing: the back-fill must
   * be idempotent, so re-running it is a no-op and not an error. Creation must
   * never call this.
   */
  async claimAlone(name: string, interestId: string): Promise<boolean> {
    const nameNormalised = InterestNameClaimRepository.fold(name);
    try {
      await this.putItem(
        {
          ...keys.interestNameClaim(nameNormalised),
          type: 'InterestNameClaim',
          interestId,
          nameNormalised,
          claimedAt: new Date().toISOString(),
        },
        'attribute_not_exists(pk)',
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases a claim, so a merged-away name does not stay permanently unusable.
   *
   * Unlike 011's equivalent this HAS a caller by design (013/T034): a merge
   * retires the source, and contract §1 row 4 requires somebody typing that name
   * afterwards to land on the surviving interest rather than be refused by a
   * claim pointing at something retired.
   */
  async release(name: string): Promise<void> {
    await this.deleteItem(keys.interestNameClaim(InterestNameClaimRepository.fold(name)));
  }
}
