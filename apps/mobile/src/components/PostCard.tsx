import { Image, Pressable, Text, View } from 'react-native';
import type { MediaItem, Post } from '@sih/shared';
import { Avatar } from './Avatar';
import { InterestWord } from './InterestWord';
import { Skeleton } from './Skeleton';
import { useTheme } from '../ui/useTheme';
import { radius, space, type as typeScale } from '../ui/tokens';

/**
 * 007/FR-021, FR-024 — THE WATERFALL CARD.
 *
 * Rebuilt from `design/007-ui/Main.dc.html`. The shape changed with the feed:
 * 006's card was a full-width row with the author on top, and 007's is a
 * column-width card whose MEDIA COMES FIRST, at its own aspect ratio, with the
 * title, a byline, a like count and the interest word beneath it.
 *
 * Media at its own ratio is not decoration — it is what makes the waterfall a
 * waterfall. Equal-height cards in two columns are a grid, and a grid crops
 * every photograph to the same rectangle, which is the thing that made the
 * earlier passes look like every other product.
 *
 * NO SHADOW (FR-023). Depth is the white card on the warm page, the gutter, and
 * the 14pt radius. Nothing else.
 *
 * ONE CARD FOR ALL FIVE SURFACES (006/R8). Five hand-written cards would be five
 * places for the author, the counts or the interest to be forgotten — and this
 * codebase has shipped that exact shape of defect seven times, as a persistence
 * row escaping as a response, and once more as two notification category lists.
 *
 * IT READS AND FETCHES NOTHING (gate G2). Every field comes from the post it is
 * given. Showing "2 comments" tempts a fetch; a count this cannot read is a
 * count it does not show. `post-card-reads-nothing.test.ts` fails on the import,
 * not the behaviour.
 *
 * AND IT EXPLAINS NOTHING (FR-010). No "because you liked", no "suggested for
 * you". The ranking is disclosed once, in Settings, and never per post.
 */

/** Used when the contract carries no dimensions. 4:3 crops least badly. */
const FALLBACK_RATIO = 4 / 3;

/**
 * 006/R4, FR-008 — STATED, BECAUSE IT IS NOT MET.
 *
 * `handleImageJob` writes `renditions: { original }` and nothing smaller, so a
 * list renders FULL-SIZE images. FR-008 asks for the smallest rendition that
 * fits and there is not one. Adding a thumbnail is worker work this feature's
 * scope excluded; picking `thumb` first here means the day it exists, this line
 * starts using it with no other change.
 */
export function mediaUrl(item: MediaItem): string | null {
  if (item.kind === 'video') return item.posterUrl ?? null;
  const r = item.renditions ?? {};
  return r['thumb'] ?? r['original'] ?? null;
}


/**
 * 008/FR-003 — HOW MANY ITEMS A BROWSE SURFACE SHOULD SAY THERE ARE.
 *
 * EVERY item, which is the same number `MediaPager` shows - so a card saying
 * "1/3" and a pager showing three pages are the same claim.
 *
 * It counts failed items too, and that is not an oversight. A post with a failed
 * item is `failed` at post level (`ProcessingService.reconcile`) and a non-ready
 * post reaches only its author (`VisibilityFilter`), so the only person who can
 * ever see this card counting a failed item is the person who needs to know it
 * failed. Filtering here would be a client-side visibility decision agreeing
 * with the boundary today and one refactor from disagreeing.
 */
export function visibleMediaCount(post: Post): number {
  return (post.media ?? []).length;
}

export function PostCard({
  post,
  onOpen,
  onOpenInterest,
}: {
  post: Post;
  onOpen: (postId: string) => void;
  onOpenInterest?: (interestId: string) => void;
}) {
  const palette = useTheme();
  const item = post.media?.[0];
  const url = item ? mediaUrl(item) : null;
  const failed = item?.processingState === 'failed' || post.processingState === 'failed';

  /**
   * The frame's ratio is fixed BEFORE the image arrives, from the width and
   * height already on the contract — which is what keeps a column from
   * reflowing as media becomes ready (006/FR-005, SC-006). A ratio rather than
   * a height so it holds at any column width, which the waterfall depends on.
   */
  const ratio = item?.width && item.height ? item.width / item.height : FALLBACK_RATIO;

  /** The card's one interest. The design shows one word, not a row of them. */
  const interest = post.interests?.[0];

  return (
    <Pressable
      testID={`post-${post.postId}`}
      accessibilityRole="button"
      onPress={() => onOpen(post.postId)}
      style={{
        backgroundColor: palette.bg.raised,
        borderRadius: radius.card,
        overflow: 'hidden',
      }}
    >
      {item ? (
        <View
          testID={`post-media-${post.postId}`}
          style={{
            aspectRatio: ratio,
            width: '100%',
            backgroundColor: palette.bg.sunken,
          }}
        >
          {failed ? (
            <View
              testID={`post-media-failed-${post.postId}`}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md }}
            >
              {/*
                Said, not left blank. A failed post is visible only to its author
                (001/FR-010), who is the one person who needs to know why their
                post never appeared - the state feature 002 found the whole
                product silently stuck in.
              */}
              <Text
                style={{
                  color: palette.text.muted,
                  fontSize: typeScale.small.size,
                  lineHeight: typeScale.small.lineHeight,
                  textAlign: 'center',
                }}
              >
                This media could not be processed.
              </Text>
            </View>
          ) : url ? (
            <Image
              testID={`post-image-${post.postId}`}
              source={{ uri: url }}
              resizeMode="cover"
              accessibilityLabel={post.caption ?? 'Post media'}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <Skeleton style={{ width: '100%', height: '100%' }} />
          )}

          {/*
            008/FR-003 — MORE THAN ONE, WITHOUT BECOMING NAVIGABLE PER ITEM.

            A count, not a pager. A swipeable card inside a vertically scrolling
            waterfall fights the parent for the same gesture, and 007/R6 recorded
            that nesting scrollables in this feed disables windowing. The
            requirement says "without becoming navigable per item" for that
            reason, not as a simplification.
          */}
          {visibleMediaCount(post) > 1 ? (
            <View
              testID={`post-media-count-${post.postId}`}
              accessibilityLabel={`${visibleMediaCount(post)} images`}
              style={{
                position: 'absolute',
                right: space.sm,
                top: space.sm,
                paddingVertical: space.xs,
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                backgroundColor: palette.bg.raised,
              }}
            >
              <Text
                style={{
                  color: palette.text.primary,
                  fontSize: typeScale.small.size,
                  lineHeight: typeScale.small.lineHeight,
                }}
              >
                1/{visibleMediaCount(post)}
              </Text>
            </View>
          ) : null}

          {post.mediaKind === 'video' ? (
            <View
              testID={`post-video-badge-${post.postId}`}
              style={{
                position: 'absolute',
                right: space.sm,
                bottom: space.sm,
                paddingVertical: space.xs,
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                backgroundColor: palette.bg.raised,
              }}
            >
              {/* 006/FR-006: identifiable as a video without playing it. */}
              <Text
                style={{
                  color: palette.text.primary,
                  fontSize: typeScale.small.size,
                  lineHeight: typeScale.small.lineHeight,
                }}
              >
                ▶ Video
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/*
        The artboard's own metrics: 12pt padding, 8pt between the three lines.
        Every point here is multiplied by the number of cards on screen, which
        is what SC-008 measures — the text block was 134 points before the
        interest word stopped reserving a 44pt tap target in layout.
      */}
      <View style={{ padding: space.md, gap: space.sm }}>
        {post.caption ? (
          <Text
            testID="post-caption"
            // Two lines, as the artboard draws it. A third line is 18 more
            // points on every card, and a caption long enough to need it is one
            // the post detail screen shows in full.
            numberOfLines={2}
            style={{
              color: palette.text.primary,
              fontSize: typeScale.label.size,
              lineHeight: typeScale.label.lineHeight,
              fontWeight: typeScale.label.weight,
            }}
          >
            {post.caption}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Avatar userId={post.author.userId} displayName={post.author.displayName} size={18} />
          {/*
            The DISPLAY NAME, not the handle.

            The artboard shows one lowercase word per byline, which reads as
            either; the form it settles is the line — 11.5/500, muted, beside an
            18pt avatar — and the display name is what a person recognises. It
            also has to be this one for the card to agree with itself: `Avatar`
            draws its initial from the display name, so a handle beside it can
            show "m" next to "perla".
          */}
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: palette.text.muted,
              fontSize: typeScale.small.size,
              lineHeight: typeScale.small.lineHeight,
            }}
          >
            {post.author.displayName}
          </Text>
          <View style={{ flexGrow: 1 }} />
          <Text
            testID={`post-counts-${post.postId}`}
            style={{
              color: palette.text.muted,
              fontSize: typeScale.small.size,
              lineHeight: typeScale.small.lineHeight,
            }}
          >
            ♥ {post.reactionCount} · {post.commentCount}
          </Text>
        </View>

        {/*
          THE ONE QUIET SIGNATURE. One interest, as a word, in its own colour.

          006 rendered every interest on the post as a row of chips. The design
          shows the first, because a card is 178 points wide and three chips
          wrap into a paragraph of furniture - and because the point of the
          colour is that the eye can sort a feed by it at a glance, which a row
          of them defeats.
        */}
        {interest ? (
          <InterestWord
            interest={interest}
            {...(onOpenInterest ? { onPress: onOpenInterest } : {})}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A PROFILE TILE — 007/T051, `design/007-ui/Profile.dc.html`.
 *
 * The artboard's profile is a three-column grid of square tiles two points
 * apart: no card, no radius, no caption, no byline. A profile answers "what has
 * this person made", and a grid answers it in one glance where a column of
 * cards answers it one post at a time.
 *
 * Run 46's device capture is why this exists. The profile shipped rendering
 * `PostCard` in a single full-bleed column — I built the header, marked T051
 * done, and left the content as the old list. Nothing caught it because every
 * test asserts the post is PRESENT, and it was.
 *
 * `post-<id>` is unchanged, so `17-saved` and the browser journeys select the
 * same way. The video badge stays: a grid that hides which tiles are video
 * makes somebody tap to find out.
 */
export function PostTile({ post, onOpen }: { post: Post; onOpen: (postId: string) => void }) {
  const palette = useTheme();
  const item = post.media?.[0];
  const url = item ? mediaUrl(item) : null;
  const failed = item?.processingState === 'failed' || post.processingState === 'failed';

  return (
    <Pressable
      testID={`post-${post.postId}`}
      accessibilityRole="button"
      // The caption is the only description a tile has, so it carries it.
      accessibilityLabel={post.caption ?? 'Post'}
      onPress={() => onOpen(post.postId)}
      style={{ flex: 1, aspectRatio: 1, backgroundColor: palette.bg.sunken }}
    >
      {failed ? (
        <View
          testID={`post-media-failed-${post.postId}`}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xs }}
        >
          <Text
            style={{
              color: palette.text.muted,
              fontSize: typeScale.small.size,
              lineHeight: typeScale.small.lineHeight,
              textAlign: 'center',
            }}
          >
            Not processed
          </Text>
        </View>
      ) : url ? (
        <Image
          testID={`post-image-${post.postId}`}
          source={{ uri: url }}
          resizeMode="cover"
          accessibilityLabel={post.caption ?? 'Post media'}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Skeleton style={{ width: '100%', height: '100%' }} />
      )}

      {/*
        008/FR-003, on the tile. Same rule as the card and the same reason: a
        grid that hides which tiles hold more than one image makes somebody tap
        to find out - the argument the video badge above was already making.
      */}
      {visibleMediaCount(post) > 1 ? (
        <View
          testID={`post-media-count-${post.postId}`}
          accessibilityLabel={`${visibleMediaCount(post)} images`}
          style={{
            position: 'absolute',
            right: space.xs,
            top: space.xs,
            paddingHorizontal: space.xs,
            borderRadius: radius.pill,
            backgroundColor: palette.bg.raised,
          }}
        >
          <Text style={{ fontSize: typeScale.small.size, color: palette.text.primary }}>
            1/{visibleMediaCount(post)}
          </Text>
        </View>
      ) : null}

      {post.mediaKind === 'video' ? (
        <View
          testID={`post-video-badge-${post.postId}`}
          style={{
            position: 'absolute',
            right: space.xs,
            bottom: space.xs,
            paddingHorizontal: space.xs,
            borderRadius: radius.pill,
            backgroundColor: palette.bg.raised,
          }}
        >
          <Text style={{ fontSize: typeScale.small.size, color: palette.text.primary }}>
            Video
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
