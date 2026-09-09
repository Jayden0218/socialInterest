import { Pressable, Text, View } from 'react-native';
import type { InterestRef, Post, PublicProfile } from '@sih/shared';
import { MIN_TOUCH_TARGET, activePalette as palette, space, textStyle } from '../../ui/theme';
import { EmptyState } from '../../ui/primitives';
import { Waterfall } from '../../components/Waterfall';
import { PostCard } from '../../components/PostCard';
import type { PagedState } from '../../components/PagedPostList';
import { labelWithParent } from './InterestScreen';

/**
 * 008/US6 — finding a post by its words.
 *
 * A SECOND surface in Discover, never a replacement for the first. Interest
 * search is how this product is navigated (Constitution I) and post search is
 * additional, which is why this is a tab beside it rather than a rewrite of it.
 *
 * Two server-supplied fields are READ HERE, and that is the point of the file.
 * `meta.terms` and `fallback` are declared on the response, and 008 exists
 * because this build shipped three declared halves with no other half - a media
 * set nothing rendered past the first item, a `readAt` nothing wrote, a tab with
 * no feed behind it. A field the server populates and no client reads is the
 * same defect from the other end, and `response-shape.spec.ts` cannot see it:
 * only a client can.
 */
export function PostSearchResults({
  query,
  state,
  terms,
  fallback,
  onLoadMore,
  onOpenPost,
  onOpenInterest,
  onOpenPerson,
}: {
  query: string;
  state: PagedState<Post>;
  /** The words the server actually searched on, after stop-words (FR-023). */
  terms?: string[];
  /** FR-022: arrives in the SAME response as an empty result. */
  fallback?: { interests: InterestRef[]; people: PublicProfile[] } | null;
  onLoadMore: () => void;
  onOpenPost: (postId: string) => void;
  onOpenInterest?: (interestId: string) => void;
  onOpenPerson?: (handle: string) => void;
}) {
  if (query.trim().length === 0) {
    return (
      <EmptyState
        testID="post-search-prompt"
        title="Search posts"
        body="Type a word and see the posts that use it."
      />
    );
  }

  const empty = state.items.length === 0 && !state.loading;

  return (
    <View testID="post-search-results" style={{ flex: 1, gap: space.sm }}>
      {/*
        FR-023. A query of nothing but stop-words matches nothing, and without
        this line that is indistinguishable from a product that is broken.
      */}
      {terms && terms.length > 0 ? (
        <Text testID="post-search-terms" style={{ ...textStyle.caption, color: palette.text.muted }}>
          {`Searching for ${terms.join(', ')}`}
        </Text>
      ) : (
        <Text testID="post-search-terms" style={{ ...textStyle.caption, color: palette.text.muted }}>
          No searchable words in that query
        </Text>
      )}

      {empty ? (
        <View style={{ gap: space.md }}>
          <EmptyState
            testID="post-search-empty"
            title="No posts use that word"
            body="These interests and people match it instead."
          />
          {fallback && fallback.interests.length > 0 && onOpenInterest ? (
            <View testID="post-search-fallback-interests" style={{ gap: space.xs }}>
              <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Interests</Text>
              {fallback.interests.map((i) => (
                <Pressable
                  key={i.interestId}
                  testID={`post-search-interest-${i.interestId}`}
                  accessibilityRole="button"
                  onPress={() => onOpenInterest(i.interestId)}
                  // A result row is a whole-row target and still has to BE 44
                  // tall — 007 measured the interest word at 36.7 under a
                  // comment claiming 44, so the number is asserted here rather
                  // than assumed from the padding.
                  style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
                >
                  <Text style={{ ...textStyle.body, color: palette.text.primary }}>
                    {labelWithParent(i)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {fallback && fallback.people.length > 0 && onOpenPerson ? (
            <View testID="post-search-fallback-people" style={{ gap: space.xs }}>
              <Text style={{ ...textStyle.caption, color: palette.text.muted }}>People</Text>
              {fallback.people.map((p) => (
                <Pressable
                  key={p.handle}
                  testID={`post-search-person-${p.handle}`}
                  accessibilityRole="button"
                  onPress={() => onOpenPerson(p.handle)}
                  // A result row is a whole-row target and still has to BE 44
                  // tall — 007 measured the interest word at 36.7 under a
                  // comment claiming 44, so the number is asserted here rather
                  // than assumed from the padding.
                  style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
                >
                  <Text style={{ ...textStyle.body, color: palette.text.primary }}>
                    {`${p.displayName} · @${p.handle}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        /*
          The same waterfall the feed uses, and NO dwell reporting: search is a
          person looking for something, not the ranked surface, and 008/FR-021
          says searching moves no ranking weight. The server-side guard
          (`search-records-no-signals.spec.ts`) cannot see a client that posts a
          signal of its own - the Following tab needed the same care for the
          same reason, and this is the one line that decides it here.
        */
        <Waterfall
          state={state}
          onLoadMore={onLoadMore}
          renderPost={(post) => (
            <PostCard
              post={post}
              onOpen={onOpenPost}
              {...(onOpenInterest ? { onOpenInterest } : {})}
            />
          )}
        />
      )}
    </View>
  );
}
