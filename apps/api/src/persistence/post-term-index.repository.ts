import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * 008/A46 — the index that makes post search a Query per term.
 *
 * Structurally identical to `PostInterestIndexItem`, deliberately: it is a
 * CANDIDATE index, and `VisibilityFilter` decides. `visibility` and
 * `processingState` are denormalised for the same reason they are there — so the
 * filter runs on the Query result instead of fetching every candidate — and at
 * the same cost, which is that `post-update.transaction.ts` must keep them in
 * step. It does.
 */
export interface PostTermIndexItem {
  postId: string;
  authorId: string;
  token: string;
  visibility: Visibility;
  processingState: ProcessingState;
  createdAt: string;
}

@Injectable()
export class PostTermIndexRepository extends BaseRepository {
  /** A46 — posts containing one term, newest first. */
  async listByTerm(
    token: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PostTermIndexItem>> {
    return this.query<PostTermIndexItem>(keys.postTermIndexPrefix(token).pk, {
      skPrefix: SK_PREFIX.post,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }
}
