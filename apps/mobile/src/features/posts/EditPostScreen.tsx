import { Text, TextInput, View } from 'react-native';
import type { InterestRef, Visibility } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';
import { InterestSelector } from '../publish/InterestSelector';
import { VisibilityControl } from '../publish/VisibilityControl';

export interface EditPostDraft {
  caption: string;
  interests: InterestRef[];
  visibility: Visibility;
}

/**
 * FR-011, FR-017. Narrowing visibility is the one edit whose consequences are
 * not undone by editing again: outstanding share links stop resolving
 * immediately (FR-042), and anyone who had the post open loses it. So the screen
 * says so BEFORE the change rather than after.
 */
export function narrowingWarning(from: Visibility, to: Visibility): string | null {
  const rank: Record<Visibility, number> = { public: 2, followers: 1, private: 0 };
  if (rank[to] >= rank[from]) return null;
  return to === 'private'
    ? 'Existing links to this post will stop working, and only you will see it.'
    : 'Existing links will only open for your followers.';
}

/** FR-006 holds for edits: a post cannot be left with no interest. */
export function canSave(draft: EditPostDraft): boolean {
  return draft.interests.length > 0 && draft.caption.length <= 2000;
}

export function EditPostScreen({
  draft,
  original,
  interestOptions,
  saving,
  onChange,
  onSave,
  onDelete,
}: {
  draft: EditPostDraft;
  original: EditPostDraft;
  interestOptions: InterestRef[];
  saving?: boolean;
  onChange: (next: EditPostDraft) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const warning = narrowingWarning(original.visibility, draft.visibility);

  return (
    <Screen testID="edit-post-screen">
      <Text style={{ ...textStyle.display, fontWeight: '700', color: palette.text.primary }}>Edit post</Text>

      <TextInput
        testID="edit-caption-input"
        accessibilityLabel="Caption"
        value={draft.caption}
        onChangeText={(caption) => onChange({ ...draft, caption })}
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
        selected={draft.interests}
        options={interestOptions}
        onChange={(interests) => onChange({ ...draft, interests })}
      />

      <VisibilityControl value={draft.visibility} onChange={(visibility) => onChange({ ...draft, visibility })} />

      {warning ? <Banner tone="warning" testID="narrowing-warning">{warning}</Banner> : null}
      {draft.interests.length === 0 ? (
        <Banner tone="danger" testID="no-interest-warning">
          A post must stay filed under at least one interest.
        </Banner>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Button
          testID="edit-save"
          label={saving ? 'Saving…' : 'Save changes'}
          disabled={!canSave(draft) || saving === true}
          onPress={onSave}
        />
        <Button testID="edit-delete" label="Delete post" variant="danger" onPress={onDelete} />
      </View>
    </Screen>
  );
}
