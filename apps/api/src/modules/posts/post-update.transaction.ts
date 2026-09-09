import { Inject, Injectable } from '@nestjs/common';
import { TransactWriteCommand, type DynamoDBDocumentClient, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Visibility } from '@sih/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { DOC_CLIENT } from '../../persistence/dynamo-client';
import { keys } from '../../persistence/keys';
import { tokenise } from '../search/tokeniser';
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

    /**
     * 008/US6 — THE TERM ROWS FOLLOW THE CAPTION AND THE VISIBILITY.
     *
     * Both halves, and the first version of this feature's design had NEITHER:
     *
     *  - **A caption edit re-indexes.** Captions are editable, so without this a
     *    post stays findable by a word its caption no longer contains and
     *    unfindable by one it now does — an index that is wrong in a way nothing
     *    else in the suite would notice.
     *  - **A visibility change fans out to them**, like every other index item.
     *    This file's own comment below says an index item whose visibility
     *    drifts from the post's "is exactly the SC-009 failure this class exists
     *    to make impossible", and a term row is one more index item.
     *
     * Rewritten wholesale rather than diffed: `MAX_TERMS_PER_POST` bounds it at
     * 40, and a Put over an unchanged row is idempotent, so computing a minimal
     * diff would add a way to be wrong in exchange for nothing.
     */
    const currentTerms = tokenise(post.caption);
    const nextTerms = tokenise(caption);
    const removedTerms = currentTerms.filter((t) => !nextTerms.includes(t));

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
      // 008/US6. Terms the caption no longer contains, removed in the same step.
      ...removedTerms.map((token) => ({
        Delete: {
          TableName: table,
          Key: keys.postTermIndex(token, post.createdAt, post.postId),
        },
      })),
      // Every current term row rewritten with the new denormalised values.
      ...nextTerms.map((token) => ({
        Put: {
          TableName: table,
          Item: {
            ...keys.postTermIndex(token, post.createdAt, post.postId),
            type: 'PostTermIndex',
            postId: post.postId,
            authorId: post.authorId,
            token,
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
          // 008/US6. And from every term partition, for exactly the same
          // reason: a deleted post lingering in a search index is a row the
          // filter would have to remove on every query forever.
          ...tokenise(post.caption).map((token) => ({
            Delete: {
              TableName: table,
              Key: keys.postTermIndex(token, post.createdAt, post.postId),
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
