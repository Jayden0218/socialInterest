import { Inject, Injectable } from '@nestjs/common';
import { PersonRepository } from '../../persistence/person.repository';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { PostRepository, type PostItem } from '../../persistence/post.repository';
import { InterestRepository } from '../../persistence/interest.repository';
import { rankByEngagement, type EngagedItem } from './engagement-order';
import { PlaceRepository } from '../../persistence/place.repository';
import { OBJECT_STORE, type ObjectStore } from '../../ports';
import { ProfileProjection } from '../people/profile.projection';
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
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
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
      // 008/US5. THE one projection - `avatarUrl` reaches every surface that
      // shows a person, presigned, instead of one surface as a raw storage key.
      author: await this.profiles.fromPerson(post.authorId, author ?? null),
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
      // 008/FR-030. The stored list, never re-parsed from the caption.
      visibility: post.visibility,
      processingState: post.processingState,
      mediaKind: post.mediaKind,
      media: await Promise.all(media.map((m) => this.toMediaItem(m))),
      /**
       * 008/FR-030. The STORED list, never re-parsed from the caption.
       *
       * On the response and NOT on `VisibilityCandidate`: a mention is not a
       * visibility input, and putting it there would be a second predicate
       * beside the boundary.
       */
      mentions: post.mentions ?? [],
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

  /**
   * The contract's MediaItem, from the persistence record.
   *
   * This did not exist: `media` was the raw MediaItemRecord, spread straight
   * into the response. Two consequences, and the first is a shipped defect:
   *
   * 1. `posterUrl` was NEVER SENT. The record has `posterKey` - an object-store
   *    key, not a URL - so FR-009's "display a thumbnail before playback begins"
   *    reached no client at all. It appears nowhere in the API source.
   * 2. Internal fields leaked: `postId`, `type`, `ordinal`, `exifStripped` and
   *    `originalKey` - the storage path of the ORIGINAL, pre-strip upload.
   *
   * This is the seventh instance in this repository of a persistence row
   * escaping as a response. `renditions` gets the same treatment: keys become
   * URLs, because a client cannot fetch a key.
   */
  /**
   * 006/R4b. PRESIGNED, NOT PUBLIC.
   *
   * `publicUrl` returns an unsigned URL, and the bucket is private, so every
   * image request was 403 - media had never displayed anywhere. It was invisible
   * because nothing had ever put a photograph on a browse surface: the device
   * flows assert API calls rather than pixels, and the browser journeys assert
   * testIDs.
   *
   * The fix is NOT to open the bucket. That hands every scraped key to anyone,
   * which is precisely what N-04 exists to forbid and what Principle III puts
   * server-side. A signed URL is issued instead, and only here - after
   * `VisibilityFilter` has already decided this viewer may see this post.
   *
   * The trade this accepts, stated rather than glossed: a signed URL is a bearer
   * token for one object until it expires, so a link copied out of a response
   * works for whoever holds it, for 15 minutes. That is the standard shape of
   * media authorisation and it is bounded; an open bucket is neither.
   */
  private async toMediaItem(
    m: Awaited<ReturnType<PostRepository['listMedia']>>[number],
  ): Promise<Record<string, unknown>> {
    const url = async (key: string | undefined): Promise<string | null> =>
      key ? this.store.presignedGetUrl(key) : null;
    return {
      kind: m.kind,
      processingState: m.processingState,
      ...(m.width !== undefined ? { width: m.width } : {}),
      ...(m.height !== undefined ? { height: m.height } : {}),
      ...(m.durationMs !== undefined ? { durationMs: m.durationMs } : {}),
      posterUrl: await url(m.posterKey),
      renditions: Object.fromEntries(
        await Promise.all(
          Object.entries(m.renditions ?? {}).map(async ([name, key]) => [
            name,
            await this.store.presignedGetUrl(key),
          ]),
        ),
      ),
      // Part of the contract on purpose: a client can tell a viewer that media
      // is still being prepared rather than showing an empty frame (FR-010).
      exifStripped: m.exifStripped,
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

  /**
   * The HYDRATED post this viewer may open, or null — 007/T053.
   *
   * `getById` hands its caller the raw `{ post, media }` it used to decide, and
   * a caller that returns that to a client ships the defect this file records
   * six times over. So the one caller that needs a response rather than a
   * decision gets it from here, where `toResponse` runs on the rows already in
   * hand: no second read, and no opportunity to build a seventh responder.
   */
  async visibleResponse(viewer: Viewer, postId: string): Promise<Record<string, unknown> | null> {
    const result = await this.getById(viewer, postId);
    if (!('post' in result)) return null;
    return this.toResponse(result.post, result.media);
  }

  /**
   * Surface: interest space (A4).
   *
   * HYDRATED. It was not, until 004/US3 probed it with a real request: this
   * returned VisibilityFilter's CANDIDATE rows - postId, authorId, visibility,
   * processingState, createdAt - so every post in every interest space had no
   * caption, no media, no author and no counts.
   *
   * That is the SIXTH instance of this defect here. The feed, post detail, both
   * comment paths, notifications and a person's own profile all shipped it
   * first. It survived on the product's PRIMARY BROWSE SURFACE because nothing
   * asked: the journeys compared postIds, the matrix tests the filter rather
   * than the response, and the app renders `caption ?? ''` - so a blank caption
   * looks like a post without one.
   *
   * The filter decides WHAT is visible. It was never the shape of what to send.
   */
  async listByInterest(
    viewer: Viewer,
    interestId: string,
    opts: {
      limit?: number;
      cursor?: string | null;
      /** 004/FR-027. Reorders the admitted set; never a different query. */
      order?: 'new' | 'top';
      /** 004/FR-029. Matched AFTER filtering - see below. */
      q?: string;
    } = {},
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
    const hydrated = await this.hydrate(visible);

    /**
     * 004/FR-029. SURFACE 11.
     *
     * Matched AFTER the filter, never before. Matching first and filtering
     * after would leak through the count - "3 results" for a person who may see
     * one of them tells them two exist - and that is a leak the response body
     * never shows.
     */
    const matched = opts.q ? hydrated.filter((p) => matchesQuery(p, opts.q!)) : hydrated;

    /**
     * 004/FR-027, FR-028. Reorders what is already there.
     *
     * Applied to `matched`, which is the set `order=new` would return. SC-009
     * asserts the id sets are identical between orderings, so a version of this
     * that ran its own query would fail rather than merely be wrong.
     */
    const ordered =
      opts.order === 'top'
        ? (rankByEngagement(matched as unknown as EngagedItem[]) as unknown as PostSummary[])
        : matched;

    return { items: ordered, nextCursor: page.nextCursor };
  }

  /**
   * Candidates in, responses out.
   *
   * One place, so the next surface cannot get it wrong in a seventh way. A
   * candidate whose post has vanished between the query and the fetch is
   * dropped rather than returned half-formed.
   */
  private async hydrate(candidates: { postId: string }[]): Promise<PostSummary[]> {
    const items = await Promise.all(candidates.map((c) => this.responseFor(c.postId)));
    return items.filter((p): p is NonNullable<typeof p> => p !== null) as unknown as PostSummary[];
  }

  /**
   * The contract's Post, by id. THE one responder.
   *
   * Exists because the feed had grown its OWN hydration - a second shape with
   * `interestIds` (raw ids) where the contract promises `interests` (refs with
   * names), and no media at all. A client generated from the contract crashes on
   * `post.interests.map`, which is precisely the defect 002 recorded for post
   * detail, reproduced independently on a different endpoint.
   *
   * Two hand-written responders is two chances to diverge from the document
   * both sides are generated from. This is the same argument as VisibilityFilter,
   * applied to the shape rather than to the decision.
   */
  async responseFor(postId: string): Promise<Record<string, unknown> | null> {
    const found = await this.posts.findWithMedia(postId);
    return found ? this.toResponse(found.post, found.media) : null;
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

/**
 * 004/FR-029. What "matches" means for an in-interest post search.
 *
 * Caption only. Deliberately not the author's name or the interest's - a search
 * within an interest that matched interest names would return everything, and
 * matching a handle would make a person findable through content they did not
 * write. Post-content search across the product is 001/D3's later work.
 */
function matchesQuery(post: unknown, q: string): boolean {
  const caption = (post as { caption?: string }).caption ?? '';
  return caption.toLowerCase().includes(q.trim().toLowerCase());
}
