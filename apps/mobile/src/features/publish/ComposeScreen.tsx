import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { InterestRef, PublicProfile, Visibility } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, Row, Screen } from '../../ui/primitives';
import { InterestSelector, canPublish } from './InterestSelector';
import { VisibilityControl, DEFAULT_VISIBILITY } from './VisibilityControl';
import { MentionSuggest } from '../../components/MentionSuggest';
import { allUploaded, canRetry, type UploadSlot } from './uploadFlow';
import type { PickedMedia } from './MediaPickerScreen';

export { runUpload, newSlot, canRetry, allUploaded } from './uploadFlow';
export type { UploadCaller } from './uploadFlow';
export type { UploadSlot, UploadStage } from './uploadFlow';

export interface ComposeScreenProps {
  media: PickedMedia[];
  slots: UploadSlot[];
  interestOptions: InterestRef[];
  selectedInterests: InterestRef[];
  caption: string;
  visibility: Visibility;
  publishing: boolean;
  error?: string | null;
  onCaptionChange: (next: string) => void;
  onInterestsChange: (next: InterestRef[]) => void;
  onVisibilityChange: (next: Visibility) => void;
  onRetry: (slot: UploadSlot) => void;
  onPublish: () => void;
  /** 004/FR-015. Rendered by the container, so this screen stays presentational. */
  placePicker?: React.ReactElement | null;
  /** 008/FR-030. People matching the handle being typed, if any. */
  mentionMatches?: PublicProfile[];
  onChooseMention?: (handle: string) => void;
  /** 008/FR-034. Descriptions being written, keyed by the media's own uri. */
  altTexts?: Record<string, string>;
  onAltTextChange?: (uri: string, text: string) => void;
  /** 008/FR-037. Saving what is here so far, and what happened last time. */
  onSaveDraft?: () => void;
  draftSaved?: boolean;
  /**
   * 008/FR-039. Ids whose upload target has expired on a restored draft.
   *
   * Named rather than dropped: a caption that came back with no pictures and no
   * explanation is indistinguishable from data loss, and the person cannot tell
   * whether to retype or re-pick.
   */
  expiredUploads?: number;
}

/**
 * Publish stays disabled until BOTH conditions hold:
 *   - at least one interest is chosen (FR-006), and
 *   - every upload has succeeded (FR-008).
 *
 * A failed slot offers Retry in place, keeping the picked media, so the person
 * is never sent back to the picker to start over.
 */
export function publishDisabledReason(
  slots: UploadSlot[],
  interests: InterestRef[],
): string | null {
  if (!canPublish(interests)) return 'Choose an interest to publish';
  if (slots.some((s) => s.stage === 'failed')) return 'Retry the failed upload to publish';
  if (!allUploaded(slots)) return 'Waiting for uploads to finish';
  return null;
}

export function ComposeScreen(props: ComposeScreenProps) {
  const blocked = publishDisabledReason(props.slots, props.selectedInterests);

  return (
    <Screen testID="compose-screen" padded={false}>
      {/*
        `Compose.dc.html` puts Share in the header as a filled accent pill.
        `publish-button` keeps its testID and its exact disabled rule; the label
        is the artboard's word. It is OUTSIDE the ScrollView so it cannot leave
        the screen when the keyboard opens over a long caption — the mechanism
        that cost run 36, applied before it costs anything.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.lg,
          minHeight: 50,
        }}
      >
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>New post</Text>
        {/*
          008/FR-037. SAVE, beside Share and never instead of it.
          
          Enabled whatever state the post is in, including with no interest
          chosen — that is the field people fill in last, and a Save that
          refused an unfinished post would be a control for the case that never
          happens. Publishing still refuses without one (001/FR-006).
        */}
        {props.onSaveDraft ? (
          <Pressable
            testID="save-draft"
            accessibilityRole="button"
            accessibilityLabel="Save as draft"
            onPress={props.onSaveDraft}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: space.md,
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...textStyle.body, color: palette.intent.accent }}>
              {props.draftSaved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="publish-button"
          accessibilityRole="button"
          accessibilityLabel={props.publishing ? 'Publishing' : 'Share post'}
          accessibilityState={{ disabled: blocked !== null || props.publishing }}
          disabled={blocked !== null || props.publishing}
          onPress={props.onPublish}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            paddingHorizontal: space.lg,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              blocked !== null || props.publishing ? palette.bg.sunken : palette.intent.accent,
          }}
        >
          <Text
            style={{
              ...textStyle.label,
              color:
                blocked !== null || props.publishing ? palette.text.muted : palette.text.onAccent,
            }}
          >
            {props.publishing ? 'Publishing…' : 'Share'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: space.lg, padding: space.lg, paddingTop: space.sm }}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          THE MEDIA, not a line of text about it. The artboard shows the tiles
          and the app showed "Uploaded" — which is the status of something the
          person cannot see, on the one screen where what they picked is the
          whole point. `upload-status-<i>` is unchanged and still carries the
          words: a journey asserts on them, and so does a screen reader.
        */}
        {/*
          A HORIZONTAL STRIP, NOT A WRAPPING GRID — measured, after run 52.

          `23-multi-photo-post` had passed on the device twice and failed on the
          first run that carried US10's per-image description field. Measured at
          the emulator's own 320x616 (`browser/compose-fit.spec.ts`): three 104pt
          tiles do not fit across 320 minus padding, so they wrapped to two rows,
          each row now 198pt tall because of the description box — and
          `interest-option-0` landed at y=709, NINETY-THREE POINTS BELOW A 616
          FOLD. Choosing an interest is required to publish (001/FR-006), so the
          screen had made its own publish button unreachable for a multi-photo
          post on a small phone.

          A row that scrolls sideways is bounded at ONE row height for any number
          of media, which is what the artboard shows and what the product
          promises (up to ten). The wrapping grid was unbounded in the one
          direction the screen cannot afford.

          Nested scrolls on DIFFERENT AXES, so this does not repeat 007/R6's
          nested-VirtualizedList problem: that was two vertical lists, where the
          inner one loses windowing.
        */}
        <ScrollView
          testID="upload-slots"
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexDirection: 'row', gap: space.sm }}
        >
          {props.slots.map((slot, i) => (
            <View key={slot.media.uri} style={{ width: 104, gap: space.xs }}>
              <Image
                source={{ uri: slot.media.uri }}
                /*
                  008/FR-035. The description FIELD below labels this image, and
                  the status text beside it says what is happening to it. An
                  image announcing itself as well would read every tile twice.
                */
                accessible={false}
                accessibilityIgnoresInvertColors
                style={{
                  width: 104,
                  height: 130,
                  borderRadius: radius.card,
                  backgroundColor: palette.bg.sunken,
                  opacity: slot.stage === 'uploaded' ? 1 : 0.55,
                }}
              />
              {/*
                008/FR-034, US10 — WHERE A DESCRIPTION IS WRITTEN.
                
                Per image, beside the image, because a post carries up to ten
                and one box for all of them would describe none of them. Never
                required: FR-035's fallback exists precisely so that a post
                without descriptions is still usable, and a publish flow that
                demanded one would teach people to type "photo".
              */}
              {props.onAltTextChange ? (
                <TextInput
                  testID={`alt-text-${i}`}
                  accessibilityLabel={`Describe image ${i + 1}`}
                  placeholder="Describe it"
                  placeholderTextColor={palette.text.muted}
                  value={props.altTexts?.[slot.media.uri] ?? ''}
                  onChangeText={(next) => props.onAltTextChange?.(slot.media.uri, next)}
                  maxLength={300}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: palette.line.hairline,
                    borderRadius: radius.md,
                    padding: space.xs,
                    minHeight: 44,
                    color: palette.text.primary,
                    ...textStyle.caption,
                  }}
                />
              ) : null}
              <Text
                testID={`upload-status-${i}`}
                style={{ ...textStyle.small, color: slot.stage === 'failed' ? palette.intent.danger : palette.text.muted }}
              >
                {slot.stage === 'uploaded'
                  ? 'Uploaded'
                  : slot.stage === 'failed'
                    ? `Failed: ${slot.error ?? 'unknown error'}`
                    : slot.stage === 'uploading'
                      ? `Uploading ${Math.round(slot.progress * 100)}%`
                      : 'Waiting'}
              </Text>
              {canRetry(slot) ? (
                <Button
                  testID={`upload-retry-${i}`}
                  label="Retry"
                  variant="secondary"
                  onPress={() => props.onRetry(slot)}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>

        {/*
          The caption is TEXT ON THE PAGE in the artboard, not a boxed input —
          a post is what you wrote, and a border around it makes it look like a
          form field on a screen whose whole subject is the writing.
        */}
        <TextInput
          testID="caption-input"
          accessibilityLabel="Caption"
          placeholder="Say something about this"
          placeholderTextColor={palette.text.muted}
          value={props.caption}
          onChangeText={props.onCaptionChange}
          multiline
          maxLength={2000}
          style={{
            minHeight: 88,
            color: palette.text.primary,
            textAlignVertical: 'top',
            ...textStyle.body,
          }}
        />
        {props.expiredUploads ? (
          <Banner tone="warning" testID="draft-media-expired">
            {`This draft is older than its ${props.expiredUploads === 1 ? 'picture' : 'pictures'}. The words are here; choose the media again.`}
          </Banner>
        ) : null}

        {/*
          008/FR-030. The people a partial `@handle` could mean.
          
          Under the field, so it cannot cover what is being typed. The container
          searches only while a handle is being typed at the END of the text —
          see `trailingMention`.
        */}
        {props.mentionMatches && props.onChooseMention ? (
          <MentionSuggest people={props.mentionMatches} onChoose={props.onChooseMention} />
        ) : null}

        <View style={{ height: 1, backgroundColor: palette.line.hairline }} />

        <InterestSelector
          selected={props.selectedInterests}
          options={props.interestOptions}
          onChange={props.onInterestsChange}
        />

        <VisibilityControl value={props.visibility ?? DEFAULT_VISIBILITY} onChange={props.onVisibilityChange} />

        {/*
          004/FR-015, FR-024. OPTIONAL, and optional means skippable: publishing
          must remain exactly as easy as it was, or a feature meant to add
          context has instead added a step to every post.
        */}
        {props.placePicker ?? null}

        {props.error ? <Banner tone="danger" testID="compose-error">{props.error}</Banner> : null}
        {/*
          A disabled control with no explanation is the defect 004 shipped here:
          the upload silently never completed, the button stayed disabled, and
          tapping it was a no-op that looked like a frozen app. Share is now in
          the header and the reason is still on the page.
        */}
        {blocked ? <Banner tone="info" testID="publish-blocked-reason">{blocked}</Banner> : null}
      </ScrollView>
    </Screen>
  );
}
