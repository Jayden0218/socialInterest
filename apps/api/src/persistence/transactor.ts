import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { PG_POOL } from './pg-pool';
import { runTransaction } from './base.repository';

/**
 * The descriptors a transaction is built from: `Put`, `Delete`, `Update`.
 *
 * STILL THE SDK'S SHAPE, AND DELIBERATELY SO FOR NOW. Twenty-nine repositories
 * and five services construct these today; changing the shape means touching
 * all of them, which is the remodelling 010/R2 defers — and doing it in the same
 * change that replaces the engine would make one reviewable diff into two
 * unreviewable ones. What moved is where the shape is NAMED: inside the seam,
 * so nothing outside `persistence/` has to import the SDK to build one.
 *
 * The type is all that remains of the dependency. No SDK code runs.
 */
export type TransactionItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

/**
 * 010. THE ONE PLACE A MULTI-ITEM WRITE IS EXECUTED.
 *
 * `BaseRepository.transact` was supposed to be that place and was not: five
 * files outside `persistence/` built and sent their own `TransactWriteCommand`
 * against the injected document client, at ten call sites — post publish, post
 * update, reactions, comment edit/delete and block severance. Every one of them
 * bypassed the base class entirely, and `010/plan.md` sized the whole migration
 * on the assumption that none of them existed.
 *
 * That matters more than tidiness. `transact` is the only thing that makes
 * 001/FR-017 possible: a visibility change lands on the post item and every one
 * of its index items, or on none of them. The seven-primitive contract proves
 * that for `BaseRepository.transact` and says nothing about ten sites that
 * never call it — so a migration could have ported the base class, watched a
 * green contract, and left five files speaking to an engine that was gone.
 *
 * `one-datastore-seam.spec.ts` fails the build if anything outside this
 * directory names the datastore SDK. It was watched RED first, naming all five.
 */
@Injectable()
export class Transactor {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Applies every item, or none of them.
   *
   * An empty list is a no-op rather than an error: callers build these from
   * loops that can legitimately come out empty — an unfollow with nothing to
   * sever, a post with no interests left to re-index.
   */
  async run(items: TransactionItems | undefined): Promise<void> {
    if (!items || items.length === 0) return;
    await runTransaction(this.pool, items);
  }
}
