import { ScrollView, Text, TextInput, View } from 'react-native';
import type { InterestRef, Visibility } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Banner, Button, Row, Screen } from '../../ui/primitives';
import { InterestSelector, canPublish } from './InterestSelector';
import { VisibilityControl, DEFAULT_VISIBILITY } from './VisibilityControl';
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
    <Screen testID="compose-screen">
      <ScrollView contentContainerStyle={{ gap: space.lg }}>
        <Text style={{ ...textStyle.display, fontWeight: '700', color: palette.text.primary }}>New post</Text>

        <View testID="upload-slots" style={{ gap: space.sm }}>
          {props.slots.map((slot, i) => (
            <Row key={slot.media.uri} style={{ justifyContent: 'space-between' }}>
              <Text testID={`upload-status-${i}`} style={{ ...textStyle.caption, color: palette.text.muted }}>
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
            </Row>
          ))}
        </View>

        <TextInput
          testID="caption-input"
          accessibilityLabel="Caption"
          placeholder="Say something about this"
          value={props.caption}
          onChangeText={props.onCaptionChange}
          multiline
          maxLength={2000}
          style={{
            borderWidth: 1,
            borderColor: palette.line.hairline,
            borderRadius: radius.md,
            padding: space.md,
            minHeight: 88,
            color: palette.text.primary,
            ...textStyle.body,
          }}
        />

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
        {blocked ? <Banner tone="info" testID="publish-blocked-reason">{blocked}</Banner> : null}

        <Button
          testID="publish-button"
          label={props.publishing ? 'Publishing…' : 'Publish'}
          disabled={blocked !== null || props.publishing}
          onPress={props.onPublish}
        />
      </ScrollView>
    </Screen>
  );
}
