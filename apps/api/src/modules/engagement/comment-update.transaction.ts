import { Inject, Injectable } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/configuration";
import {
  Transactor,
  type TransactionItems,
} from "../../persistence/transactor";
import { keys } from "../../persistence/keys";

/**
 * 008/T123, US8 — FR-028. THE ROW AND THE COUNT MOVE TOGETHER, OR NEITHER DOES.
 *
 * A comment's soft delete and the post's `commentCount` are two writes to two
 * items, and doing them in sequence is how a count and the rows it counts part
 * company: an interruption between them leaves a post claiming a comment nobody
 * can see, forever, with nothing to reconcile it. 005/R5 made the rating
 * aggregate transactional for exactly this reason, and the same argument applies
 * whenever a number summarises rows.
 *
 * The delete carries a CONDITION that the comment is not already deleted, so a
 * second delete fails the whole transaction rather than decrementing again. A
 * count below its rows is worse than a count above them: it hides content that
 * exists, and nothing in the product would ever notice.
 */
@Injectable()
export class CommentUpdateTransaction {
  constructor(
    @Inject(Transactor) private readonly transactor: Transactor,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async softDelete(ref: {
    postId: string;
    commentId: string;
    createdAt: string;
  }): Promise<void> {
    const table = this.config.dynamo.tableName;
    const items: TransactionItems = [
      {
        Update: {
          TableName: table,
          Key: keys.comment(ref.postId, ref.createdAt, ref.commentId),
          UpdateExpression: "SET deletedAt = :now",
          // `attribute_not_exists` OR null: a row written before this field
          // existed carries neither, and both mean "not deleted".
          ConditionExpression:
            "attribute_not_exists(deletedAt) OR deletedAt = :null",
          ExpressionAttributeValues: {
            ":now": new Date().toISOString(),
            ":null": null,
          },
        },
      },
      {
        Update: {
          TableName: table,
          Key: keys.post(ref.postId),
          UpdateExpression: "ADD commentCount :minus",
          ExpressionAttributeValues: { ":minus": -1 },
        },
      },
    ];
    await this.transactor.run(items);
  }
}
