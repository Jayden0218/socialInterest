import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import type { TransactionItems } from './transactor';
import { keys } from './keys';

export interface HandleClaimItem {
  userId: string;
  handleLower: string;
  claimedAt: string;
}

/**
 * 011/T005. THE ROW THAT MAKES A HANDLE UNIQUE.
 *
 * Its absence was a live defect (research R1), and the measurement is in
 * `docs/verification/011-guard-red-log.md`: **eight of eight simultaneous
 * claims on one handle succeeded.** Not an occasional race — no constraint at
 * all, because `PersonRepository.create` guards on `attribute_not_exists(pk)`
 * where `pk` is `USER#<userId>`, a fresh identifier per call.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE CLAIM IS A WRITE CONDITION, NEVER A PRECEDING READ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `findByHandle` before creating is the obvious fix and it is the wrong one: two
 * requests a millisecond apart both read "free" and both write. The condition
 * has to be part of the statement the database decides, once, atomically —
 * which is exactly what `putItem`'s condition already is, and why this needed a
 * row rather than a mechanism.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXPOSES ITEMS RATHER THAN A `claim()` THAT WRITES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A claim written separately from the person it belongs to has two failure
 * modes and both are worse than refusing: a person without their claim leaves
 * the handle free for somebody else, and a claim without the person burns a
 * handle nobody can ever use. So the caller puts the claim into the SAME
 * transaction as everything else it is writing — the person in Phase 2, the
 * person AND the credential in US1 — and `transact` makes it all-or-none.
 *
 * `claimAlone` exists for the back-fill (T007) and for nothing else, because
 * there the person already exists and there is nothing to write it with.
 */
@Injectable()
export class HandleClaimRepository extends BaseRepository {
  /**
   * The handle is folded HERE and nowhere else for this row.
   *
   * `findByHandle` lower-cases its argument, so a claim stored with the casing
   * somebody typed would defend `Jo` while the lookup resolved `jo` — a
   * constraint and a lookup disagreeing about what a handle is, which is the
   * shape of every defect in this feature's research.
   */
  static fold(handle: string): string {
    return handle.trim().toLowerCase();
  }

  /**
   * The write, as a transaction item for the caller to include.
   *
   * `attribute_not_exists(pk)` is the whole constraint. On this engine that
   * compiles to `on conflict do nothing` plus a row-count check, and a
   * transaction whose item writes nothing fails the transaction — which is what
   * makes the losing sign-up refuse rather than silently proceed.
   */
  static claimItem(handle: string, userId: string, tableName: string): TransactionItems[number] {
    const handleLower = HandleClaimRepository.fold(handle);
    const item: HandleClaimItem = {
      userId,
      handleLower,
      claimedAt: new Date().toISOString(),
    };
    return {
      Put: {
        // Threaded from the caller's `tableName` rather than restated. The field
        // is vestigial on this engine (base.repository: one table, kept for one
        // release), and a second literal for a name that is about to go away is
        // a second place to update when it does.
        TableName: tableName,
        Item: { ...keys.handleClaim(handleLower), type: 'HandleClaim', ...item },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }

  async find(handle: string): Promise<HandleClaimItem | null> {
    return this.getItem<HandleClaimItem>(keys.handleClaim(HandleClaimRepository.fold(handle)));
  }

  /**
   * Claims a handle on its own. FOR THE BACK-FILL, and for accounts that already
   * exist — there is no person to write alongside, because they were written
   * before this row existed.
   *
   * Returns false when the handle is already claimed rather than throwing: the
   * back-fill is idempotent by requirement, so re-running it must be a no-op and
   * not an error. A sign-up must never call this.
   */
  async claimAlone(handle: string, userId: string): Promise<boolean> {
    const handleLower = HandleClaimRepository.fold(handle);
    try {
      await this.putItem(
        {
          ...keys.handleClaim(handleLower),
          type: 'HandleClaim',
          userId,
          handleLower,
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
   * Releases a claim.
   *
   * Nothing in the product calls this yet and that is deliberate rather than an
   * oversight: there is no account deletion path that frees a handle, and adding
   * a releaser with no caller would be the declared-half-with-no-other-half
   * shape this project has recorded seven times. It exists because a claim that
   * cannot be released is a handle that can never be recovered from a deleted
   * account, and the deletion path is where that will be needed — with a test
   * that drives it, at that point.
   */
  async release(handle: string): Promise<void> {
    await this.deleteItem(keys.handleClaim(HandleClaimRepository.fold(handle)));
  }
}
