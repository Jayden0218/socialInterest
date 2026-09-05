import { Inject, Injectable } from '@nestjs/common';
import { PersonRepository } from '../../persistence/person.repository';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { PostRepository, type PostItem } from '../../persistence/post.repository';
import {
  VisibilityFilter,
  type Decision,
  type VisibilityCandidate,
  type Viewer,
} from '../../visibility/visibility.filter';

export interface PostSummary {
  postId: string;
  authorId: string;
  visibility: VisibilityCandidate['visibility'];
  processingState: VisibilityCandidate['processingState'];
  createdAt: string;
}

/**
 * EVERY post read surface goes through here, and every method here goes through
 * VisibilityFilter (constitution principle II). No caller may build its own
 * visibility predicate; if a new surface is added it belongs in this file and in
 * contracts/visibility-matrix.md's surface list, together.
 */
@Injectable()
export class PostQueryService {
  constructor(
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  private async toCandidate(post: PostItem): Promise<VisibilityCandidate> {
    const author = await this.people.findById(post.authorId);
    return {
      postId: post.postId,
      authorId: post.authorId,
      visibility: post.visibility,
      processingState: post.processingState,
      deletedAt: post.deletedAt ?? null,
      ...(post.removedByModeration ? { removedByModeration: true } : {}),
      authorStatus: author?.status ?? 'active',
    };
  }

  /** Surface: share link / post detail. Returns the decision so the controller
   *  can distinguish 404 (gone) from 403 (not for you) per FR-042. */
  async getById(
    viewer: Viewer,
    postId: string,
  ): Promise<
    | { post: PostItem; media: Awaited<ReturnType<PostRepository['listMedia']>> }
    | Extract<Decision, { visible: false }>
  > {
    const found = await this.posts.findWithMedia(postId);
    if (!found) return { visible: false, reason: 'gone' };
    const decision = await this.visibility.decide(
      viewer,
      await this.toCandidate(found.post),
      this.visibility.newRequestCache(),
    );
    if (decision.visible) return found;
    return decision;
  }

  /** Surface: interest space (A4). */
  async listByInterest(
    viewer: Viewer,
    interestId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: PostSummary[]; nextCursor: string | null }> {
    const page = await this.index.listByInterest(interestId, opts);
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
    return { items: visible, nextCursor: page.nextCursor };
  }

  /** Surface: profile (A5). */
  async listByAuthor(
    viewer: Viewer,
    authorId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: PostSummary[]; nextCursor: string | null }> {
    const page = await this.posts.listByAuthor(authorId, opts);
    const author = await this.people.findById(authorId);
    const cache = this.visibility.newRequestCache();
    const candidates = page.items.map((p) => ({
      postId: p.postId,
      authorId: p.authorId,
      visibility: p.visibility,
      processingState: p.processingState,
      deletedAt: p.deletedAt ?? null,
      ...(p.removedByModeration ? { removedByModeration: true } : {}),
      authorStatus: author?.status ?? ('active' as const),
      createdAt: p.createdAt,
    }));
    const visible = await this.visibility.filter(viewer, candidates, cache);
    return { items: visible, nextCursor: page.nextCursor };
  }
}
