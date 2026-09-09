import { Inject, Injectable } from '@nestjs/common';
import type { DynamoDBDocumentClient, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { DOC_CLIENT } from '../../persistence/dynamo-client';
import { keys } from '../../persistence/keys';
import { tokenise } from '../search/tokeniser';
import type { MediaItemRecord, PostItem } from '../../persistence/post.repository';

/**
 * Atomic post writes.
 *
 * A post is a post item, N media items, and one index item per interest in its
 * expanded set. Writing them separately would leave a post visible in one
 * interest space and not another if a write failed midway - and more importantly
 * it would make FR-017 (a visibility change applies everywhere immediately)
 * impossible to guarantee. Everything goes in one TransactWriteItems.
 *
 * The set is bounded: at most 10 media items, 2 index items per assigned
 * interest, and at most ONE place index item (004/FR-015) - well inside
 * DynamoDB's 100-item transaction limit.
 *
 * 004 widened all three methods below with the place index item. It is not
 * optional bookkeeping: the place page is surface 8 of the visibility matrix,
 * and an index item whose `visibility` drifts from the post's is exactly the
 * SC-009 failure this class exists to make impossible.
 */
@Injectable()
export class PostTransaction {
  constructor(
    @Inject(DOC_CLIENT) private readonly doc: DynamoDBDocumentClient,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async createPost(input: {
    post: PostItem;
    media: MediaItemRecord[];
    /** Already expanded: sub-interest AND its parent (FR-024). */
    expandedInterestIds: string[];
    /**
     * 008/FR-038. The draft this post came from, deleted IN THIS TRANSACTION.
     *
     * "Stops being a draft" cannot half-happen: a post published while its
     * draft survives leaves a person with a duplicate they will publish again,
     * and a draft deleted before the post is written loses everything. One
     * transaction is the only version of this that has no window.
     */
    draftId?: string;
  }): Promise<void> {
    const { post, media, expandedInterestIds, draftId } = input;
    const table = this.config.dynamo.tableName;

    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: table,
          Item: {
            ...keys.post(post.postId),
            ...keys.postByAuthor(post.authorId, post.createdAt, post.postId),
            type: 'Post',
            ...post,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      ...media.map((m) => ({
        Put: {
          TableName: table,
          Item: { ...keys.mediaItem(post.postId, m.ordinal), type: 'MediaItem', ...m },
        },
      })),
      ...expandedInterestIds.map((interestId) => ({
        Put: {
          TableName: table,
          Item: {
            ...keys.postInterestIndex(interestId, post.createdAt, post.postId),
            type: 'PostInterestIndex',
            postId: post.postId,
            authorId: post.authorId,
            interestId,
            // Denormalised so the visibility filter runs on Query results
            // directly. Kept in step by updateVisibility below.
            visibility: post.visibility,
            processingState: post.processingState,
            createdAt: post.createdAt,
          },
        },
      })),
      /**
       * 008/A46. One row per distinct caption term, capped at 40.
       *
       * Same shape as the interest and place index items above, deliberately -
       * including the denormalised `visibility`, which is what lets the filter
       * run on Query results. `MAX_TERMS_PER_POST` is part of what keeps this
       * transaction inside DynamoDB's 100-item ceiling; see the tokeniser.
       */
      ...tokenise(post.caption).map((token) => ({
        Put: {
          TableName: table,
          Item: {
            ...keys.postTermIndex(token, post.createdAt, post.postId),
            type: 'PostTermIndex',
            postId: post.postId,
            authorId: post.authorId,
            token,
            visibility: post.visibility,
            processingState: post.processingState,
            createdAt: post.createdAt,
          },
        },
      })),
      // 004/FR-016. At most one - a post has at most one place. Same shape as
      // the interest index item, deliberately: that is what makes the place page
      // one more row in the matrix rather than a new class of test.
      ...(post.placeId
        ? [
            {
              Put: {
                TableName: table,
                Item: {
                  ...keys.postPlaceIndex(post.placeId, post.createdAt, post.postId),
                  type: 'PostPlaceIndex',
                  postId: post.postId,
                  authorId: post.authorId,
                  placeId: post.placeId,
                  visibility: post.visibility,
                  processingState: post.processingState,
                  createdAt: post.createdAt,
                },
              },
            },
          ]
        : []),
    ];

    if (draftId) {
      items.push({
        Delete: {
          TableName: table,
          Key: keys.draft(post.authorId, draftId),
        },
      });
    }

    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }

  /**
   * FR-017: a visibility change lands on the post item and every index item, or
   * on none. Any copy missed here is an SC-009 failure.
   */
  async updateVisibility(input: {
    post: PostItem;
    expandedInterestIds: string[];
    visibility: PostItem['visibility'];
  }): Promise<void> {
    const table = this.config.dynamo.tableName;
    const updatedAt = new Date().toISOString();
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: table,
              Key: keys.post(input.post.postId),
              UpdateExpression: 'SET visibility = :v, updatedAt = :u',
              ExpressionAttributeValues: { ':v': input.visibility, ':u': updatedAt },
            },
          },
          ...input.expandedInterestIds.map((interestId) => ({
            Update: {
              TableName: table,
              Key: keys.postInterestIndex(interestId, input.post.createdAt, input.post.postId),
              UpdateExpression: 'SET visibility = :v',
              ExpressionAttributeValues: { ':v': input.visibility },
            },
          })),
          // 004/FR-017. Missing this one would leave a private post visible on
          // its place page - a leak on exactly the surface this feature added.
          ...(input.post.placeId
            ? [
                {
                  Update: {
                    TableName: table,
                    Key: keys.postPlaceIndex(
                      input.post.placeId,
                      input.post.createdAt,
                      input.post.postId,
                    ),
                    UpdateExpression: 'SET visibility = :v',
                    ExpressionAttributeValues: { ':v': input.visibility },
                  },
                },
              ]
            : []),
        ],
      }),
    );
  }

  /**
   * Keeps the denormalised processingState in step across index items.
   *
   * 008/US6 — TERM ROWS JOIN THIS, and missing them is how a public post stayed
   * unfindable by everyone but its author. The rows are written at publish, when
   * the post is still `pending`; a candidate that is not `ready` is visible only
   * to its author, so a stale row makes search look like it is enforcing a
   * privacy rule nobody wrote.
   *
   * That is the THIRD fan-out these rows have to join — visibility, deletion and
   * now processing state. The 008 analysis pass caught the first two by reading;
   * this one was caught by `post-search.spec.ts` failing, which is the argument
   * for the behavioural test existing alongside the structural reasoning.
   */
  async updateProcessingState(input: {
    post: PostItem;
    expandedInterestIds: string[];
    processingState: PostItem['processingState'];
  }): Promise<void> {
    const table = this.config.dynamo.tableName;
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: table,
              Key: keys.post(input.post.postId),
              UpdateExpression: 'SET processingState = :s, updatedAt = :u',
              ExpressionAttributeValues: {
                ':s': input.processingState,
                ':u': new Date().toISOString(),
              },
            },
          },
          ...(input.post.placeId
            ? [
                {
                  Update: {
                    TableName: table,
                    Key: keys.postPlaceIndex(
                      input.post.placeId,
                      input.post.createdAt,
                      input.post.postId,
                    ),
                    UpdateExpression: 'SET processingState = :s',
                    ExpressionAttributeValues: { ':s': input.processingState },
                  },
                },
              ]
            : []),
          ...input.expandedInterestIds.map((interestId) => ({
            Update: {
              TableName: table,
              Key: keys.postInterestIndex(interestId, input.post.createdAt, input.post.postId),
              UpdateExpression: 'SET processingState = :s',
              ExpressionAttributeValues: { ':s': input.processingState },
            },
          })),
          ...tokenise(input.post.caption).map((token) => ({
            Update: {
              TableName: table,
              Key: keys.postTermIndex(token, input.post.createdAt, input.post.postId),
              UpdateExpression: 'SET processingState = :s',
              ExpressionAttributeValues: { ':s': input.processingState },
            },
          })),
        ],
      }),
    );
  }
}
