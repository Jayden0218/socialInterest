import { Inject, Injectable } from "@nestjs/common";
import {
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { DOC_CLIENT } from "./dynamo-client";

/**
 * The descriptors a transaction is built from: `Put`, `Delete`, `Update`.
 *
 * NAMED HERE RATHER THAN IMPORTED FROM THE SDK AT EVERY CALL SITE, so the shape
 * twenty-nine repositories and five services construct has a home inside the
 * seam. The shape itself does not change during the migration — changing it
 * means touching all of them, which is the remodelling 010/R2 defers — but
 * where it is DECLARED decides whether anything outside `persistence/` has to
 * name the SDK at all.
 */
export type TransactionItems = NonNullable<
  TransactWriteCommandInput["TransactItems"]
>;

/**
 * 010. THE ONE PLACE A MULTI-ITEM WRITE IS EXECUTED.
 *
 * `BaseRepository.transact` was supposed to be that place and was not: five
 * files outside `persistence/` built and sent their own `TransactWriteCommand`
 * against the injected document client, at ten call sites — post publish, post
 * update, reactions, comment edit/delete and block severance. Every one of them
 * bypassed the base class entirely.
 *
 * The plan sized this whole migration on "the seam is already in the right
 * place: four files, 554 lines". It was not, and `one-datastore-seam.spec.ts`
 * is what said so — it went red naming all five before this existed.
 *
 * The reason it matters is sharper than tidiness. `transact` is the only thing
 * that makes 001/FR-017 possible: a visibility change lands on the post item
 * and every one of its index items, or on none of them. The seven-primitive
 * contract proves that guarantee for `BaseRepository.transact` and says nothing
 * about ten call sites that never call it — so a migration could have ported
 * the base class, watched a green contract, and left the five behind.
 *
 * This is the same shape the project keeps paying for: a declared seam with
 * work happening on both sides of it. A feed with a second hand-rolled
 * responder. A `VisibilityFilter` with six hand-written predicates beside it. A
 * notification category added to the list that DESCRIBES notifications and not
 * to the one that RENDERS them. The seam existed; it was just never the only
 * way through.
 */
@Injectable()
export class Transactor {
  constructor(
    @Inject(DOC_CLIENT) private readonly doc: DynamoDBDocumentClient,
  ) {}

  /**
   * Applies every item, or none of them.
   *
   * An empty list is a no-op rather than an error: callers build these from
   * loops that can legitimately come out empty — an unfollow with nothing to
   * sever, a post with no interests left to re-index.
   */
  async run(items: TransactionItems | undefined): Promise<void> {
    if (!items || items.length === 0) return;
    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }
}
