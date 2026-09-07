import { Inject, Injectable } from '@nestjs/common';
import { PersonRepository } from '../../persistence/person.repository';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { PostRepository, type PostItem } from '../../persistence/post.repository';
import { InterestRepository } from '../../persistence/interest.repository';
import { PlaceRepository } from '../../persistence/place.repository';
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
    @Inject(InterestRepository) private readonly interests: InterestRepository,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
    @Inject(PlaceRepository) private readonly places: PlaceRepository,
  ) {}

  /**
   * Turns a stored post into the contract's Post.
   *
   * The detail endpoint used to return `{ ...postItem }` - the persistence row -
   * so a client got `authorId` and `interestIds` where the contract promises an
   * `author` object and `interests` refs, plus internal `type` and `updatedAt`
   * it should never see. Every client crashed on `post.interests.map`, and the
   * author's handle being absent silently disabled blocking, which needs it.
   *
   * This is the same defect the feed had, on a different endpoint: an index or
   * storage shape escaping as a response. Both now hydrate in one place.
   */
  async toResponse(
    post: PostItem,
    media: Awaited<ReturnType<PostRepository['listMedia']>>,
  ): Promise<Record<string, unknown>> {
    const [author, interests, place] = await Promise.all([
      this.people.findById(post.authorId),
      Promise.all(post.interestIds.map((id) => this.interests.findById(id))),
      // 004/FR-023. Hydrated here with everything else, so every surface that
      // returns a post shows its place - rather than one endpoint learning to.
      post.placeId ? this.places.find(post.placeId) : Promise.resolve(null),
    ]);

    return {
      postId: post.postId,
      author: {
        userId: post.authorId,
        handle: author?.handle ?? 'unknown',
        displayName: author?.displayName ?? 'Unknown',
      },
      ...(post.caption === undefined ? {} : { caption: post.caption }),
      // FR-006 guarantees at least one interest, so a missing catalogue row is
      // a broken reference rather than an empty list. Dropping it silently
      // would render a post that looks like it belongs to nothing.
      interests: interests
        .filter((i): i is NonNullable<typeof i> => i !== null)
        .map((i) => ({
          interestId: i.interestId,
          name: i.name,
          slug: i.slug,
          level: i.level,
        })),
      visibility: post.visibility,
      processingState: post.processingState,
      mediaKind: post.mediaKind,
      media,
      reactionCount: post.reactionCount,
      commentCount: post.commentCount,
      place: place
        ? {
            placeId: place.placeId,
            name: place.name,
            category: place.category,
            locality: place.locality,
          }
        : null,
      createdAt: post.createdAt,
    };
  }

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

    /**
     * HYDRATE. The filter's output is a set of visibility CANDIDATES - postId,
     * visibility, processingState, timestamps - and returning it as the
     * response handed clients a post with no caption, no media, no counts and
     * no author. A person's own profile showed rows with nothing in them, and
     * `caption: null` for a post published with a caption.
     *
     * This is the fifth instance of the same defect in this codebase: the feed,
     * post detail, both comment paths and notifications all returned
     * persistence or index rows as responses before this. The filter decides
     * WHAT is visible; it was never the shape of what to send.
     */
    const byId = new Map(page.items.map((p) => [p.postId, p]));
    const items = await Promise.all(
      visible.map(async (v) => {
        const post = byId.get(v.postId);
        if (!post) return v;
        return this.toResponse(post, await this.posts.listMedia(v.postId));
      }),
    );
    return { items, nextCursor: page.nextCursor } as unknown as {
      items: PostSummary[];
      nextCursor: string | null;
    };
  }
}
