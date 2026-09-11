/**
 * PlaceContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { PostCard } from '../components/PostCard';
import { PlaceScreen } from '../features/places/PlaceScreen';
import type { Place, Review } from '@sih/shared';
import { usePaged } from '../containers';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

/** FR-016, FR-018. Surface 8 in the app. */
export function PlaceContainer({
  placeId,
  signedIn,
  onOpenPost,
  onReport,
}: {
  placeId: string;
  /**
   * 005/FR-006. Rating requires a caller; reading does not.
   *
   * Passed in rather than derived here. The app already knows, and asking
   * `session.me()` per place page would be a network call to answer a question
   * the navigator holds - and would render the control briefly for a signed-out
   * visitor while the answer was in flight.
   */
  signedIn?: boolean;
  onOpenPost: (postId: string) => void;
  onReport: (subjectId: string) => void;
}) {
  const data = useData();
  const [place, setPlace] = useState<Place | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const { state, loadMore } = usePaged(
    (cursor) => data.places.posts(placeId, cursor ? { cursor } : {}),
    [placeId],
  );

  const reload = useCallback(async () => {
    try {
      setPlace(await data.places.get(placeId));
    } catch (err) {
      setError(err instanceof DataError ? err.problem.title ?? 'No such place' : 'No such place');
    }
  }, [data, placeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleFollow = useCallback(
    async (next: boolean) => {
      setPending(true);
      try {
        await (next ? data.places.follow(placeId) : data.places.unfollow(placeId));
        // Read back from the SERVER rather than flipping a local flag, so
        // "Following" means the follow was accepted.
        await reload();
      } finally {
        setPending(false);
      }
    },
    [data, placeId, reload],
  );

  /**
   * 005/US1, US2. EVERY HOOK ABOVE EVERY RETURN.
   *
   * `__tests__/hooks-before-return.test.ts` fails the build for a hook after ANY
   * return, and it exists because 004 shipped `toggleSave` declared below the
   * container's final return: dead code, a temporal dead zone, and a star that
   * did nothing - with typecheck, lint and fifty mobile tests all green, because
   * they render screens with props and never press a container's button.
   */
  const loadReviews = useCallback(async () => {
    try {
      setReviews((await data.places.reviews(placeId, { limit: 20 })).items);
    } catch {
      // A place page whose posts render is not broken because its reviews did
      // not. Left null, which renders nothing rather than an error over content
      // that loaded fine.
    }
  }, [data, placeId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const rate = useCallback(
    async (score: number) => {
      setSaving(true);
      try {
        await data.places.rate(placeId, { score, body: body.trim() ? body.trim() : null });
        // Both, and from the server. The summary comes back in the response, but
        // the place also carries `viewerRating`, and reloading is what proves the
        // write landed rather than assuming it from a 200.
        await reload();
        await loadReviews();
      } finally {
        setSaving(false);
      }
    },
    [data, placeId, body, reload, loadReviews],
  );

  const withdrawRating = useCallback(async () => {
    setSaving(true);
    try {
      await data.places.withdrawRating(placeId);
      setBody('');
      await reload();
      await loadReviews();
    } finally {
      setSaving(false);
    }
  }, [data, placeId, reload, loadReviews]);

  if (error) return <Failed message={error} />;
  if (!place) return <Failed message="Loading…" />;
  return (
    <PlaceScreen
      place={place}
      posts={state}
      reviews={reviews ?? []}
      reviewBody={body}
      savingReview={saving}
      signedIn={signedIn === true}
      followPending={pending}
      onToggleFollow={(next) => void toggleFollow(next)}
      onLoadMore={loadMore}
      onReport={() => onReport(placeId)}
      onRate={(score) => void rate(score)}
      onWithdrawRating={() => void withdrawRating()}
      onChangeReviewBody={setBody}
      // FR-014. The compound `<placeId>:<userId>` is the review's subject id -
      // the same shape messages already use, so the moderation queue needs no
      // new addressing scheme.
      onReportReview={(p, authorId) => onReport(`${p}:${authorId}`)}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
    />
  );
}
