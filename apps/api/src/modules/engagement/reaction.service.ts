import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/problem.filter";
import { CONFIG, type AppConfig } from "../../config/configuration";
import {
  Transactor,
  type TransactionItems,
} from "../../persistence/transactor";
import { keys } from "../../persistence/keys";
import { PostRepository } from "../../persistence/post.repository";
import { ReactionRepository } from "../../persistence/reaction.repository";
import { EVENT_BUS, type EventBus } from "../../ports";

/**
 * FR-039: at most one reaction per person per post, and the count must match.
 *
 * The count is incremented inside the SAME transaction as the reaction item,
 * guarded by attribute_not_exists. A double-tap therefore fails the condition
 * and increments nothing - the count cannot drift from the number of reaction
 * items, which a read-then-write would allow under concurrency.
 */
@Injectable()
export class ReactionService {
  constructor(
    @Inject(Transactor) private readonly transactor: Transactor,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(ReactionRepository) private readonly reactions: ReactionRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async react(
    postId: string,
    userId: string,
  ): Promise<{ reactionCount: number; viewerHasReacted: true }> {
    const table = this.config.dynamo.tableName;
    try {
      await this.transactor.run([
        {
          Put: {
            TableName: table,
            Item: {
              ...keys.reaction(postId, userId),
              type: "Reaction",
              postId,
              userId,
              createdAt: new Date().toISOString(),
            },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Update: {
            TableName: table,
            Key: keys.post(postId),
            UpdateExpression: "ADD reactionCount :one",
            ExpressionAttributeValues: { ":one": 1 },
            ConditionExpression: "attribute_exists(pk)",
          },
        },
      ]);
      await this.events.publish({
        type: "post.reacted",
        payload: { postId, userId },
      });
    } catch (e) {
      // Either already reacted (idempotent) or the post is gone.
      const post = await this.posts.findById(postId);
      if (!post)
        throw new DomainError(HttpStatus.NOT_FOUND, "No longer available");
      void e;
    }
    return {
      reactionCount: (await this.posts.findById(postId))?.reactionCount ?? 0,
      viewerHasReacted: true,
    };
  }

  async unreact(
    postId: string,
    userId: string,
  ): Promise<{ reactionCount: number; viewerHasReacted: false }> {
    const table = this.config.dynamo.tableName;
    if (await this.reactions.exists(postId, userId)) {
      // The swallow is deliberate and unchanged: two simultaneous unreacts race,
      // the condition refuses the loser, and "it was already gone" is not a
      // failure the caller can act on. It is the mirror of the conditional put
      // that makes one-reaction-per-person work in the other direction.
      await this.transactor
        .run([
          {
            Delete: {
              TableName: table,
              Key: keys.reaction(postId, userId),
              ConditionExpression: "attribute_exists(pk)",
            },
          },
          {
            Update: {
              TableName: table,
              Key: keys.post(postId),
              UpdateExpression: "ADD reactionCount :minusOne",
              ExpressionAttributeValues: { ":minusOne": -1 },
            },
          },
        ])
        .catch(() => undefined);
    }
    return {
      reactionCount: (await this.posts.findById(postId))?.reactionCount ?? 0,
      viewerHasReacted: false,
    };
  }
}
