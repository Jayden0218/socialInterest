/**
 * ComposeContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { completeMention, trailingMention } from '../components/MentionSuggest';
import { PlacePicker } from '../features/places/PlacePicker';
import type { PublicProfile, PlaceSummary } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';
import {
  ComposeScreen,
  newSlot,
  runUpload,
  type UploadSlot,
} from '../features/publish/ComposeScreen';
import { type PickedMedia } from '../features/publish/MediaPickerScreen';
import { DEFAULT_VISIBILITY } from '../features/publish/VisibilityControl';
import type { InterestRef, Visibility } from '@sih/shared';

/**
 * Compose itself, once media has been chosen.
 *
 * `media` is still a prop rather than picked here, so this stays drivable from a
 * test with a fixed set - which is what the browser journeys and the unit tests
 * both need.
 */
export function ComposeContainer({
  media,
  onPublished,
}: {
  media: PickedMedia[];
  onPublished: (postId: string) => void;
}) {
  const data = useData();
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [options, setOptions] = useState<InterestRef[]>([]);
  const [selected, setSelected] = useState<InterestRef[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 004/FR-015. Optional throughout - none of this blocks publishing.
  const [place, setPlace] = useState<PlaceSummary | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeLocality, setPlaceLocality] = useState('');
  const [placeMatches, setPlaceMatches] = useState<PlaceSummary[]>([]);
  // 008/FR-030. People matching the handle currently being typed.
  const [mentionMatches, setMentionMatches] = useState<PublicProfile[]>([]);
  /**
   * 008/FR-034. Descriptions, keyed by the media's own uri.
   *
   * By URI rather than by index: a failed upload can be retried and the slots
   * re-ordered around it, and a description that followed a POSITION would then
   * describe the wrong picture — the same class of mistake as a testID carrying
   * a global index, which cost run 48.
   */
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  // 008/FR-037. The draft this compose session is editing, once saved.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  /**
   * 008/FR-030. Searched only while a handle is being typed at the END.
   *
   * `trailingMention` returns null the moment the person moves past it, which
   * clears the list — a suggestion list that outlives the thing it suggests for
   * is a control that edits text behind the cursor.
   */
  useEffect(() => {
    const partial = trailingMention(caption);
    if (!partial || partial.length < 2) {
      setMentionMatches([]);
      return;
    }
    let live = true;
    void data.people
      .search(partial, { limit: 5 })
      // Swallowed: a people lookup that is down must never take publishing down
      // with it, which is the same rule the place lookup follows.
      .then((page) => live && setMentionMatches(page.items))
      .catch(() => live && setMentionMatches([]));
    return () => {
      live = false;
    };
  }, [data, caption]);

  useEffect(() => {
    let live = true;
    data.interests
      .suggested()
      .then((page) => live && setOptions(page.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * FR-014. Matches WHILE TYPING, not a rejection after submitting.
   *
   * A failed search is swallowed: an offline lookup must not stop somebody
   * publishing, because the place is optional and the post is not.
   */
  useEffect(() => {
    if (placeQuery.trim().length === 0 || placeLocality.trim().length === 0) {
      setPlaceMatches([]);
      return;
    }
    let live = true;
    void data.places
      .search(placeQuery, { locality: placeLocality, limit: 5 })
      .then((r) => live && setPlaceMatches(r.items))
      .catch(() => live && setPlaceMatches([]));
    return () => {
      live = false;
    };
  }, [data, placeQuery, placeLocality]);

  const upload = useCallback(
    (slot: UploadSlot) => {
      void runUpload(data.client, slot, (next) =>
        setSlots((all) => all.map((s) => (s.media.uri === next.media.uri ? next : s))),
      );
    },
    [data],
  );

  useEffect(() => {
    const fresh = media.map(newSlot);
    setSlots(fresh);
    fresh.forEach(upload);
  }, [media, upload]);

  /**
   * Creating from inside compose, rather than sending the person to another
   * screen and losing their draft.
   *
   * A 409 attaches the existing place instead of failing - which is the whole
   * dedupe, expressed as behaviour rather than as a warning nobody reads.
   */
  const createPlaceInline = useCallback(async () => {
    try {
      setPlace(
        await data.places.create({
          name: placeQuery.trim(),
          category: 'restaurant',
          locality: placeLocality.trim(),
        }),
      );
    } catch (e: unknown) {
      const problem = e instanceof DataError ? (e.problem as unknown as PlaceSummary) : null;
      if (e instanceof DataError && e.status === 409 && problem?.placeId) {
        setPlace(problem);
      } else {
        setError(e instanceof DataError ? e.message : String(e));
      }
    }
  }, [data, placeQuery, placeLocality]);

  /**
   * 008/FR-037. Saves whatever is here, including nothing much.
   *
   * The same `draftId` is reused on a second save, so a person pressing Save
   * twice has ONE unfinished post rather than a list of near-identical ones —
   * which is what a create-only endpoint would have produced.
   */
  const saveDraft = useCallback(async () => {
    try {
      const saved = await data.drafts.save({
        ...(draftId ? { draftId } : {}),
        ...(caption ? { caption } : {}),
        interestIds: selected.map((i) => i.interestId),
        ...(place ? { placeId: place.placeId } : {}),
        uploadIds: slots.map((s) => s.uploadId).filter((id): id is string => Boolean(id)),
        altTexts: Object.fromEntries(
          slots
            .filter((s) => s.uploadId && (altTexts[s.media.uri] ?? '').trim().length > 0)
            .map((s) => [s.uploadId as string, (altTexts[s.media.uri] as string).trim()]),
        ),
      });
      setDraftId(saved.draftId);
      setDraftSaved(true);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    }
  }, [data, draftId, caption, selected, place, slots, altTexts]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const post = await data.posts.publish({
        uploadIds: slots.map((s) => s.uploadId).filter((id): id is string => Boolean(id)),
        // 008/FR-038. Publishing FROM this draft removes it in the same
        // transaction, so a person cannot be left with a duplicate to publish
        // a second time.
        ...(draftId ? { draftId } : {}),
        // Keyed by UPLOAD ID for the server, translated from uri here — the one
        // place that knows both.
        altTexts: Object.fromEntries(
          slots
            .filter((s) => s.uploadId && (altTexts[s.media.uri] ?? '').trim().length > 0)
            .map((s) => [s.uploadId as string, (altTexts[s.media.uri] as string).trim()]),
        ),
        interestIds: selected.map((i) => i.interestId),
        visibility,
        ...(caption ? { caption } : {}),
        // 004/FR-015. Absent unless the AUTHOR picked one. There is deliberately
        // no fallback that infers a place from anything.
        ...(place ? { placeId: place.placeId } : {}),
      });
      onPublished(post.postId);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }, [data, slots, selected, visibility, caption, place, altTexts, draftId, onPublished]);

  return (
    <ComposeScreen
      media={media}
      slots={slots}
      interestOptions={options}
      selectedInterests={selected}
      caption={caption}
      visibility={visibility}
      publishing={publishing}
      error={error}
      onCaptionChange={setCaption}
      mentionMatches={mentionMatches}
      onChooseMention={(handle) => setCaption((c) => completeMention(c, handle))}
      altTexts={altTexts}
      onAltTextChange={(uri, text) => setAltTexts((prev) => ({ ...prev, [uri]: text }))}
      draftSaved={draftSaved}
      onSaveDraft={() => void saveDraft()}
      onInterestsChange={setSelected}
      onVisibilityChange={setVisibility}
      onRetry={upload}
      onPublish={() => void publish()}
      placePicker={
        <PlacePicker
          query={placeQuery}
          locality={placeLocality}
          matches={placeMatches}
          selected={place}
          onQueryChange={setPlaceQuery}
          onLocalityChange={setPlaceLocality}
          onSelect={setPlace}
          onCreate={() => void createPlaceInline()}
        />
      }
    />
  );
}
