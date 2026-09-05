import { Inject, Injectable } from '@nestjs/common';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { VisibilityFilter, type Viewer } from '../../visibility/visibility.filter';
import { PersonRepository } from '../../persistence/person.repository';
import { InterestFollowService } from '../interests/interest-follow.service';
import { FollowExpansion } from './follow-expansion';

export interface FeedItem {
  postId: string;
  authorId: string;
  interestId: string;
  visibility: 'public' | 'followers' | 'private';
  processingState: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  emptyStateHint: 'no_followed_interests' | 'no_posts_yet' | null;
  /** How many interest partitions this page read. Surfaced for bench:feed. */
  fanOutWidth: number;
}

/**
 * READ-TIME FAN-IN (research D1). The home feed is assembled per request, not
 * materialised per person.
 *
 * This is forced by the spec, not chosen for taste. FR-017 requires a visibility
 * change to apply immediately everywhere and SC-009 forbids any leak; a
 * materialised timeline would need every copy rewritten on a single
 * public->private flip, and any copy missed is an SC-009 failure. Assembling
 * here means visibility is evaluated once, against current state.
 *
 * The accepted cost is that latency scales with follow count - hence the
 * 200-interest cap, the parallel queries below, and bench:feed reporting p95
 * BROKEN DOWN BY follow count rather than as a single headline number.
 */
@Injectable()
export class FeedService {
  /**
   * Per-interest read depth. Each partition returns its newest few, which are
   * then merged and truncated: reading `limit` from every partition would be
   * wasteful, but reading too few risks a page that under-fills after
   * visibility filtering.
   */
  private static readonly PER_INTEREST_OVERFETCH = 2;

  constructor(
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(InterestFollowService) private readonly follows: InterestFollowService,
    @Inject(FollowExpansion) private readonly expansion: FollowExpansion,
  ) {}

  async homeFeed(
    viewer: { userId: string },
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<FeedPage> {
    const limit = opts.limit ?? 20;

    const followed = await this.follows.followedIds(viewer.userId);
    if (followed.length === 0) {
      // FR-036: a distinguishable empty state. "Follow some interests" and
      // "the interests you follow have no posts" need different prompts.
      return { items: [], nextCursor: null, emptyStateHint: 'no_followed_interests', fanOutWidth: 0 };
    }

    // FR-028: expanded at read time, so a sub-interest created after the follow
    // is included with no back-fill.
    const partitions = this.expansion.expand(followed);

    // The fan-in. Parallel, because the whole page waits on the slowest query.
    const perInterest = Math.max(3, Math.ceil(limit / 2)) * FeedService.PER_INTEREST_OVERFETCH;
    const pages = await Promise.all(
      partitions.map((interestId) =>
        this.index
          .listByInterest(interestId, { limit: perInterest })
          .catch(() => ({ items: [], nextCursor: null })),
      ),
    );

    // Merge newest-first, de-duplicating a post that appears under both a
    // sub-interest and its parent (FR-024 writes an index item for each).
    const seen = new Set<string>();
    const merged: FeedItem[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.postId)) continue;
        seen.add(item.postId);
        merged.push(item as FeedItem);
      }
    }
    merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const after = this.decodeAfter(opts.cursor);
    const windowed = after ? merged.filter((i) => i.createdAt < after) : merged;

    // Visibility LAST, on current state, through the one boundary.
    const cache = this.visibility.newRequestCache();
    const authors = new Map<string, 'active' | 'deleting' | 'deleted'>();
    await Promise.all(
      [...new Set(windowed.slice(0, limit * 3).map((i) => i.authorId))].map(async (id) => {
        authors.set(id, (await this.people.findById(id))?.status ?? 'active');
      }),
    );

    const visible = await this.visibility.filter(
      viewer,
      windowed.slice(0, limit * 3).map((i) => ({ ...i, authorStatus: authors.get(i.authorId) ?? 'active' })),
      cache,
    );

    const items = visible.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      // Cursor is the timestamp boundary, not an offset (FR-035): posts
      // published mid-scroll cannot shift the reader's position.
      nextCursor: visible.length > limit && last ? this.encodeAfter(last.createdAt) : null,
      emptyStateHint: items.length === 0 ? 'no_posts_yet' : null,
      fanOutWidth: partitions.length,
    };
  }

  private encodeAfter(createdAt: string): string {
    return Buffer.from(JSON.stringify({ before: createdAt }), 'utf8').toString('base64url');
  }

  private decodeAfter(cursor: string | null | undefined): string | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        before?: string;
      };
      return parsed.before ?? null;
    } catch {
      return null;
    }
  }
}
