import { Image, Pressable, Text, View } from 'react-native';
import type { MediaItem, Post } from '@sih/shared';
import { Avatar } from './Avatar';
import { InterestChip } from './InterestChip';
import { Skeleton } from './Skeleton';
import { useTheme } from '../ui/useTheme';
import { elevation, radius, space, type as typeScale } from '../ui/tokens';

/**
 * 006/US1. A POST, SHOWN.
 *
 * What this replaces is the point: `PostRow` was a `Pressable` wrapping one
 * `Text` holding the caption, used by the feed, interest spaces, profiles, saved
 * and place pages. A media-sharing product whose every browse surface showed a
 * list of sentences.
 *
 * ONE CARD FOR ALL FIVE SURFACES (R8). Five hand-written cards would be five
 * places for the author, the counts or the interest chip to be forgotten - and
 * this codebase has shipped that exact shape of defect seven times, as a
 * persistence row escaping as a response, and once more as two notification
 * category lists. One component is the same argument as one VisibilityFilter,
 * applied to presentation.
 *
 * IT READS AND FETCHES NOTHING (gate G2). Every field comes from the post it is
 * given, enumerated in data-model.md § "What the card may read". Showing "2
 * comments" tempts a fetch; a count this cannot read is a count it does not
 * show. `post-card-reads-nothing.test.ts` fails on the import, not the
 * behaviour.
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
function mediaUrl(item: MediaItem): string | null {
  if (item.kind === 'video') return item.posterUrl ?? null;
  const r = item.renditions ?? {};
  return r['thumb'] ?? r['original'] ?? null;
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
   * height already on the contract - which is what keeps a list from shifting as
   * media becomes ready (FR-005, SC-006). A ratio rather than a height so it
   * holds at any column width.
   */
  const ratio = item?.width && item.height ? item.width / item.height : FALLBACK_RATIO;

  return (
    <Pressable
      testID={`post-${post.postId}`}
      accessibilityRole="button"
      onPress={() => onOpen(post.postId)}
      style={{
        backgroundColor: palette.bg.raised,
        borderRadius: radius.lg,
        padding: space.md,
        gap: space.sm,
        marginBottom: space.md,
        ...elevation.raised,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Avatar userId={post.author.userId} displayName={post.author.displayName} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: palette.text.primary,
              fontSize: typeScale.label.size,
              lineHeight: typeScale.label.lineHeight,
              fontWeight: typeScale.label.weight,
            }}
          >
            {post.author.displayName}
          </Text>
          <Text
            style={{
              color: palette.text.muted,
              fontSize: typeScale.caption.size,
              lineHeight: typeScale.caption.lineHeight,
            }}
          >
            @{post.author.handle}
          </Text>
        </View>
      </View>

      {item ? (
        <View
          testID={`post-media-${post.postId}`}
          style={{
            aspectRatio: ratio,
            borderRadius: radius.md,
            overflow: 'hidden',
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
                  fontSize: typeScale.caption.size,
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
                backgroundColor: palette.bg.base,
              }}
            >
              {/* FR-006: identifiable as a video without playing it. */}
              <Text style={{ color: palette.text.primary, fontSize: typeScale.caption.size }}>
                ▶ Video
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {post.caption ? (
        <Text
          testID="post-caption"
          style={{
            color: palette.text.primary,
            fontSize: typeScale.body.size,
            lineHeight: typeScale.body.lineHeight,
          }}
        >
          {post.caption}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {post.interests.map((i) => (
          <InterestChip
            key={i.interestId}
            interest={i}
            {...(onOpenInterest ? { onPress: onOpenInterest } : {})}
          />
        ))}
      </View>

      <Text
        testID={`post-counts-${post.postId}`}
        style={{
          color: palette.text.muted,
          fontSize: typeScale.caption.size,
          lineHeight: typeScale.caption.lineHeight,
        }}
      >
        ♥ {post.reactionCount} · 💬 {post.commentCount}
      </Text>
    </Pressable>
  );
}
