import { Inject, Injectable } from '@nestjs/common';
import { PostPlaceIndexRepository } from '../../persistence/post-place-index.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter, type Viewer } from '../../visibility/visibility.filter';

/**
 * SURFACE 8 of the visibility matrix (FR-016, FR-017).
 *
 * Structurally identical to the interest space: one Query on the place
 * partition produces candidates, and VisibilityFilter decides. No new
 * predicate - Constitution II says a read path may not construct one, and this
 * is the read path 004 adds.
 *
 * The hydration at the end is not decoration. FIVE times in this repository a
 * read path returned VisibilityFilter's CANDIDATE rows as the response - the
 * feed, post detail, both comment paths, notifications, and a person's own
 * profile - producing posts with no caption, no media and no author. The filter
 * decides WHAT is visible; it was never the shape of what to send.
 */
@Injectable()
export class PlacePostsService {
  constructor(
    @Inject(PostPlaceIndexRepository) private readonly index: PostPlaceIndexRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  async list(
    viewer: Viewer,
    placeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    const page = await this.index.listByPlace(placeId, opts);
    const cache = this.visibility.newRequestCache();
    const visible = await this.visibility.filter(
      viewer,
      page.items.map((i) => ({
        postId: i.postId,
        authorId: i.authorId,
        visibility: i.visibility,
        processingState: i.processingState,
        createdAt: i.createdAt,
      })),
      cache,
    );

    const items = await Promise.all(
      visible.map(async (candidate) => {
        const found = await this.posts.findWithMedia(candidate.postId);
        if (!found) return null;
        return this.queries.toResponse(found.post, found.media);
      }),
    );

    return { items: items.filter((p): p is Record<string, unknown> => p !== null), nextCursor: page.nextCursor };
  }
}
