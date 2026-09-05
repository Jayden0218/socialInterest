import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { SK_PREFIX } from './keys';

/**
 * The index item that makes A4 a single Query per interest.
 *
 * `visibility`, `processingState` and `authorId` are DENORMALISED onto it on
 * purpose: the visibility filter then runs on the Query result directly instead
 * of fetching every candidate post. The cost is that FR-017 must update the post
 * item and these index items together - which is why post writes are transactional.
 */
export interface PostInterestIndexItem {
  postId: string;
  authorId: string;
  interestId: string;
  visibility: Visibility;
  processingState: ProcessingState;
  createdAt: string;
}

@Injectable()
export class PostInterestIndexRepository extends BaseRepository {
  /** A4 - recent posts in one interest, newest first. */
  async listByInterest(
    interestId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PostInterestIndexItem>> {
    return this.query<PostInterestIndexItem>(`INTEREST#${interestId}`, {
      skPrefix: SK_PREFIX.post,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }
}
