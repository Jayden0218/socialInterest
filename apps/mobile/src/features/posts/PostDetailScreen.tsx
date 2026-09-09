import { Image, Pressable, Text, View } from 'react-native';
import type { MediaItem, Post } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { InterestWord } from '../../components/InterestWord';
import { Banner, Screen } from '../../ui/primitives';
import { MediaPager } from '../../components/MediaPager';
import { MentionText } from '../../components/MentionText';

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
  onOpenInterest,
  onOpenPerson,
}: {
  post: Post;
  /** 004/FR-023. Absent where a place page is not reachable from the surface. */
  onOpenPlace?: (placeId: string) => void;
  /** 007/FR-017, gate G2. One tap from a post to its interest's space. */
  onOpenInterest?: (interestId: string) => void;
  /** 008/FR-030. Opens a person named in the caption. */
  onOpenPerson?: (handle: string) => void;
}) {
  const notice = processingMessage(post);
  const hasMedia = (post.media?.length ?? 0) > 0;

  return (
    <Screen testID="post-detail-screen">
      {notice ? <Banner tone="info" testID="processing-notice">{notice}</Banner> : null}

      {/*
        008/FR-001 — EVERY item, not `media[0]`.

        This line read `post.media?.[0]` for seven features while the publish
        screen promised "Up to 10 photos" and the server returned all ten. The
        loss was total and silent: nine of ten photographs unreachable to
        everyone including the author.

        FR-004's "only to the author" needs no prop here and deliberately has
        none: a post with a failed media item is `failed` at post level
        (ProcessingService.reconcile), and a non-ready post is visible only to
        its author (VisibilityFilter). The boundary has already decided; the
        pager renders what arrived.
      */}
      {hasMedia ? (
        <View testID="post-media" style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' }}>
          <MediaPager post={post} />
        </View>
      ) : null}

      {post.caption ? (
        /*
          008/FR-030. The full caption, with @handles tappable.
          
          Here and in the comment list, and NOT on the card: the card truncates
          to two lines by design (007 measured what a third costs), and a link
          a reader cannot finish reading is not worth the complexity. This is
          the screen that shows the whole text.
        */
        <MentionText
          testID="post-caption"
          text={post.caption}
          style={{ ...textStyle.body, color: palette.text.primary }}
          {...(onOpenPerson ? { onOpenPerson } : {})}
        />
      ) : null}

      {/*
        007/FR-017, FR-024 — THE INTEREST, IN ITS OWN COLOUR, AND TAPPABLE.
        
        It was bare `Text` in the ACCENT colour, and both halves were wrong.

        Not tappable meant the interest space was unreachable from the one
        screen that names the interest — the identical defect 004 recorded for
        places, two paragraphs below, where a place rendered as bare text made
        the place page unreachable. Gate G2 exists because a ranked feed that
        also strands the taxonomy leaves it vestigial, which is the exact
        failure Principle I names.

        In the accent meant every interest was the same green, so the colour
        said "this is a link" instead of "this is Bouldering" — and the accent
        is supposed to be the ONE saturated colour in the chrome (FR-022).
      */}
      <View testID="post-interests" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {post.interests.map((i) => (
          <InterestWord
            key={i.interestId}
            interest={i}
            {...(onOpenInterest ? { onPress: onOpenInterest } : {})}
          />
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
          <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>
            {`${post.place.name} · ${post.place.locality}`}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
