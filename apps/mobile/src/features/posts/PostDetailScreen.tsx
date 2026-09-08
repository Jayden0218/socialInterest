import { Image, Pressable, Text, View } from 'react-native';
import type { MediaItem, Post } from '@sih/shared';
import { activePalette as palette, radius, space, type } from '../../ui/theme';
import { Banner, Screen } from '../../ui/primitives';

/**
 * FR-009: a poster frame is shown before playback begins, so a video never
 * renders as a blank rectangle while it buffers. A post still processing shows
 * its state instead — and only its author can see it at all.
 */
export function posterFor(media: MediaItem): string | null {
  return media.posterUrl ?? null;
}

export function isPlayable(post: Post): boolean {
  return post.processingState === 'ready' && post.mediaKind === 'video';
}

export function processingMessage(post: Post): string | null {
  switch (post.processingState) {
    case 'ready':
      return null;
    case 'failed':
      return 'This post could not be processed. Try uploading it again.';
    default:
      return 'Still processing. Only you can see this until it is ready.';
  }
}

export function PostDetailScreen({
  post,
  onOpenPlace,
}: {
  post: Post;
  /** 004/FR-023. Absent where a place page is not reachable from the surface. */
  onOpenPlace?: (placeId: string) => void;
}) {
  const notice = processingMessage(post);
  const first = post.media?.[0];

  return (
    <Screen testID="post-detail-screen">
      {notice ? <Banner tone="info" testID="processing-notice">{notice}</Banner> : null}

      {first ? (
        <View testID="post-media" style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' }}>
          <Image
            testID={isPlayable(post) ? 'video-poster' : 'post-image'}
            // Poster frame first for video (FR-009), never an empty box.
            source={{ uri: posterFor(first) ?? Object.values(first.renditions ?? {})[0] ?? '' }}
            style={{ flex: 1, backgroundColor: palette.bg.raised }}
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      {post.caption ? (
        <Text testID="post-caption" style={{ fontSize: type.body.size,
 lineHeight: type.body.lineHeight, color: palette.text.primary }}>
          {post.caption}
        </Text>
      ) : null}

      <View testID="post-interests" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {post.interests.map((i) => (
          <Text key={i.interestId} style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.intent.accent }}>
            {i.parent ? `${i.name} · ${i.parent.name}` : i.name}
          </Text>
        ))}
      </View>

      {/*
        004/FR-023. Tappable, and that is the point: a place rendered as bare
        text makes the place page unreachable from the only screen that names
        it. The feed used to render posts as bare Text for exactly this reason,
        and post detail was unreachable from every list in the app.
      */}
      {post.place && onOpenPlace ? (
        <Pressable testID="post-place" onPress={() => onOpenPlace(post.place!.placeId)}>
          <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.intent.accent }}>
            {`${post.place.name} · ${post.place.locality}`}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
