import { ScrollView, Text, TextInput, View } from 'react-native';
import type { InterestRef, Visibility } from '@sih/shared';
import { theme } from '../../ui/theme';
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
      <ScrollView contentContainerStyle={{ gap: theme.space.lg }}>
        <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>New post</Text>

        <View testID="upload-slots" style={{ gap: theme.space.sm }}>
          {props.slots.map((slot, i) => (
            <Row key={slot.media.uri} style={{ justifyContent: 'space-between' }}>
              <Text testID={`upload-status-${i}`} style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
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
            borderColor: theme.color.border,
            borderRadius: theme.radius.md,
            padding: theme.space.md,
            minHeight: 88,
            color: theme.color.text,
            fontSize: theme.font.md,
          }}
        />

        <InterestSelector
          selected={props.selectedInterests}
          options={props.interestOptions}
          onChange={props.onInterestsChange}
        />

        <VisibilityControl value={props.visibility ?? DEFAULT_VISIBILITY} onChange={props.onVisibilityChange} />

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
