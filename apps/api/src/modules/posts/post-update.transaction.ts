import { Inject, Injectable } from '@nestjs/common';
import { TransactWriteCommand, type DynamoDBDocumentClient, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Visibility } from '@sih/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { DOC_CLIENT } from '../../persistence/dynamo-client';
import { keys } from '../../persistence/keys';
import type { PostItem } from '../../persistence/post.repository';

export interface PostUpdate {
  caption?: string;
  visibility?: Visibility;
  /** Already expanded (sub-interest AND parent) when interests change. */
  expandedInterestIds?: string[];
  /**
   * 004/FR-015. `null` REMOVES the place; `undefined` leaves it as it is.
   * Collapsing the two would make it impossible to detach a place, which is
   * half of what the requirement asks for.
   */
  placeId?: string | null;
}

/**
 * FR-011 and FR-017, in one transaction.
 *
 * This is the operation the whole feed design exists to make possible. A
 * visibility change must land on the post item AND every one of its
 * denormalised index items, atomically - any copy left behind is a post that
 * still appears in an interest space it should have vanished from, which is an
 * SC-009 failure.
 *
 * Re-filing (FR-011) deletes the old index items and writes the new ones in the
 * SAME transaction, so a post is never momentarily in both places or neither.
 */
@Injectable()
export class PostUpdateTransaction {
  constructor(
    @Inject(DOC_CLIENT) private readonly doc: DynamoDBDocumentClient,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async apply(input: {
    post: PostItem;
    currentExpandedInterestIds: string[];
    update: PostUpdate;
  }): Promise<PostItem> {
    const table = this.config.dynamo.tableName;
    const { post, currentExpandedInterestIds, update } = input;
    const now = new Date().toISOString();

    const nextInterestIds = update.expandedInterestIds ?? currentExpandedInterestIds;
    const visibility = update.visibility ?? post.visibility;
    const caption = update.caption ?? post.caption;

    /**
     * 004/FR-015. `placeId: null` REMOVES the attachment; `undefined` leaves it
     * alone. The distinction matters - collapsing them makes it impossible to
     * take a place off a post, which is half of what the requirement asks for.
     */
    const nextPlaceId =
      update.placeId === undefined ? (post.placeId ?? null) : update.placeId;

    const updated: PostItem = {
      ...post,
      ...(caption !== undefined ? { caption } : {}),
      visibility,
      ...(update.expandedInterestIds ? { interestIds: update.expandedInterestIds } : {}),
      placeId: nextPlaceId,
      updatedAt: now,
    };

    const removed = currentExpandedInterestIds.filter((id) => !nextInterestIds.includes(id));

    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: table,
          Item: {
            ...keys.post(post.postId),
            ...keys.postByAuthor(post.authorId, post.createdAt, post.postId),
            type: 'Post',
            ...updated,
          },
        },
      },
      // Index items the post no longer belongs to, removed in the same step.
      ...removed.map((interestId) => ({
        Delete: {
          TableName: table,
          Key: keys.postInterestIndex(interestId, post.createdAt, post.postId),
        },
      })),
      // Every current index item rewritten with the new denormalised values.
      ...nextInterestIds.map((interestId) => ({
        Put: {
          TableName: table,
          Item: {
            ...keys.postInterestIndex(interestId, post.createdAt, post.postId),
            type: 'PostInterestIndex',
            postId: post.postId,
            authorId: post.authorId,
            interestId,
            visibility,
            processingState: post.processingState,
            createdAt: post.createdAt,
          },
        },
      })),
      // 004/FR-015. The place index item moves, is written, or is deleted in
      // the SAME transaction - never separately, or a post could end up listed
      // at a place it is no longer attached to.
      ...(post.placeId && post.placeId !== nextPlaceId
        ? [
            {
              Delete: {
                TableName: table,
                Key: keys.postPlaceIndex(post.placeId, post.createdAt, post.postId),
              },
            },
          ]
        : []),
      ...(nextPlaceId
        ? [
            {
              Put: {
                TableName: table,
                Item: {
                  ...keys.postPlaceIndex(nextPlaceId, post.createdAt, post.postId),
                  type: 'PostPlaceIndex',
                  postId: post.postId,
                  authorId: post.authorId,
                  placeId: nextPlaceId,
                  visibility,
                  processingState: post.processingState,
                  createdAt: post.createdAt,
                },
              },
            },
          ]
        : []),
    ];

    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
    return updated;
  }

  /** FR-012: the post and every index item leave together. */
  async softDelete(post: PostItem, expandedInterestIds: string[]): Promise<void> {
    const table = this.config.dynamo.tableName;
    const deletedAt = new Date().toISOString();
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: {
                ...keys.post(post.postId),
                ...keys.postByAuthor(post.authorId, post.createdAt, post.postId),
                type: 'Post',
                ...post,
                deletedAt,
                updatedAt: deletedAt,
              },
            },
          },
          // Hard-removed from every interest space: a soft-deleted post must not
          // linger in a listing waiting to be filtered out on read.
          ...expandedInterestIds.map((interestId) => ({
            Delete: {
              TableName: table,
              Key: keys.postInterestIndex(interestId, post.createdAt, post.postId),
            },
          })),
          // 004/FR-016. And from its place page, for exactly the same reason.
          ...(post.placeId
            ? [
                {
                  Delete: {
                    TableName: table,
                    Key: keys.postPlaceIndex(post.placeId, post.createdAt, post.postId),
                  },
                },
              ]
            : []),
        ],
      }),
    );
  }
}
