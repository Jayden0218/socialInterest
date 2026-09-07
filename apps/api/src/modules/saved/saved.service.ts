import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import { SavedPostRepository } from '../../persistence/saved-post.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter } from '../../visibility/visibility.filter';

/**
 * 004/US5. Saved posts.
 *
 * A SAVE IS A BOOKMARK, NOT A COPY. That single sentence is the whole design:
 *
 *  - saving is refused for a post the saver cannot currently see, so a save can
 *    never be a way to acquire access;
 *  - the list is resolved through VisibilityFilter at READ time, so a post whose
 *    visibility later excludes the saver simply is not there.
 *
 * The tempting shortcut - "they saved it, so they could see it" - is wrong at
 * exactly the moment it matters. SURFACE 9 of the visibility matrix.
 */
@Injectable()
export class SavedService {
  constructor(
    @Inject(SavedPostRepository) private readonly saved: SavedPostRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  async save(viewerId: string, postId: string): Promise<void> {
    // Through the boundary, not a repository read: saving a post you cannot see
    // would let the saved list become a record of what exists rather than of
    // what you chose.
    const result = await this.queries.getById({ userId: viewerId }, postId);
    if (!('post' in result)) throw new DomainError(HttpStatus.NOT_FOUND, 'No longer available');

    if (await this.saved.isSaved(viewerId, postId)) return;
    await this.saved.save({
      userId: viewerId,
      postId,
      authorId: result.post.authorId,
      visibility: result.post.visibility,
      processingState: result.post.processingState,
      savedAt: new Date().toISOString(),
      createdAt: result.post.createdAt,
    });
  }

  async unsave(viewerId: string, postId: string): Promise<void> {
    await this.saved.unsave(viewerId, postId);
  }

  async isSaved(viewerId: string, postId: string): Promise<boolean> {
    return this.saved.isSaved(viewerId, postId);
  }

  /** SURFACE 9. Most recently saved first. */
  async list(
    viewerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    const page = await this.saved.list(viewerId, opts);
    const cache = this.visibility.newRequestCache();
    const visible = await this.visibility.filter(
      { userId: viewerId },
      page.items.map((s) => ({
        postId: s.postId,
        authorId: s.authorId,
        // The DENORMALISED values on the saved row can be stale - a save is a
        // bookmark, and the post moves on without it. That is why the filter
        // runs against the post's CURRENT state below rather than trusting these.
        visibility: s.visibility,
        processingState: s.processingState,
        createdAt: s.createdAt,
      })),
      cache,
    );

    /**
     * Re-checked against current state, one by one.
     *
     * The denormalised row is a candidate, not an answer: nothing updates a
     * saved row when the post it points at is made private, so filtering on the
     * row alone would show exactly the posts SC-013 says must not appear.
     */
    const items = await Promise.all(
      visible.map(async (candidate) => {
        const current = await this.queries.getById({ userId: viewerId }, candidate.postId);
        if (!('post' in current)) return null;
        return this.queries.toResponse(current.post, await this.posts.listMedia(candidate.postId));
      }),
    );

    return {
      items: items.filter((p): p is Record<string, unknown> => p !== null),
      nextCursor: page.nextCursor,
    };
  }
}
