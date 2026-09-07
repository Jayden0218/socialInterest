import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { theme } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';
import { MEDIA_LIMITS_HINT } from './limits';

export interface PickedMedia {
  uri: string;
  kind: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
}

export interface MediaPickerScreenProps {
  available: PickedMedia[];
  selected: PickedMedia[];
  onChange: (next: PickedMedia[]) => void;
  onContinue: () => void;
  /** 003/FR-012. What the device library said, so refusal can be explained. */
  libraryStatus?: 'idle' | 'unavailable' | 'denied' | 'ready';
  /** Opens the device library. Absent in builds with no native picker. */
  onOpenLibrary?: () => void;
}

export function MediaPickerScreen({
  available,
  selected,
  onChange,
  onContinue,
  libraryStatus = 'idle',
  onOpenLibrary,
}: MediaPickerScreenProps) {
  const isSelected = (m: PickedMedia): boolean => selected.some((s) => s.uri === m.uri);

  const toggle = (m: PickedMedia): void => {
    if (isSelected(m)) {
      onChange(selected.filter((s) => s.uri !== m.uri));
      return;
    }
    // A video is always a post on its own; mixing is rejected server-side too.
    if (m.kind === 'video') {
      onChange([m]);
      return;
    }
    onChange([...selected.filter((s) => s.kind === 'image'), m]);
  };

  return (
    <Screen testID="media-picker-screen">
      <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>Choose media</Text>
      <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>{MEDIA_LIMITS_HINT}</Text>

      {/*
        FR-012. A refused permission must explain itself. Falling back silently
        to whatever media happened to be available would look like a working app
        that publishes something the person did not choose - worse than an
        error, because nothing tells them anything went wrong.
      */}
      {libraryStatus === 'denied' ? (
        <Banner tone="warning" testID="library-permission-denied">
          socialInterest cannot open your photos because access was refused. Nothing has been
          read from your device. To choose your own media, allow photo access for this app in
          your device settings, then come back here.
        </Banner>
      ) : null}

      {libraryStatus === 'unavailable' ? (
        <Banner tone="info" testID="library-unavailable">
          This build has no device gallery, so a sample image is offered instead. Publishing
          works exactly as it would with your own media.
        </Banner>
      ) : null}

      {onOpenLibrary ? (
        <Button
          testID="open-library"
          label={libraryStatus === 'denied' ? 'Try again' : 'Choose from your photos'}
          variant="secondary"
          onPress={onOpenLibrary}
        />
      ) : null}

      <FlatList
        numColumns={3}
        data={available}
        keyExtractor={(m) => m.uri}
        columnWrapperStyle={{ gap: theme.space.sm }}
        contentContainerStyle={{ gap: theme.space.sm }}
        renderItem={({ item, index }) => (
          <Pressable
            // Kind in the id, not only the index. A flow that wants the video
            // otherwise has to hard-code a position, and verify-maestro-ids
            // cannot tell a wrong index from a right one - both match the same
            // dynamic prefix, which is how a selector for a non-existent item
            // passed that check.
            testID={`media-item-${item.kind}-${index}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected(item) }}
            onPress={() => toggle(item)}
            style={{ flex: 1, aspectRatio: 1, borderRadius: theme.radius.sm, overflow: 'hidden' }}
          >
            <Image source={{ uri: item.uri }} style={{ flex: 1 }} accessibilityIgnoresInvertColors />
            {isSelected(item) ? (
              <View
                style={{
                  ...({ position: 'absolute' } as const),
                  inset: 0,
                  borderWidth: 3,
                  borderColor: theme.color.accent,
                  borderRadius: theme.radius.sm,
                }}
              />
            ) : null}
          </Pressable>
        )}
      />

      <Button
        testID="media-continue"
        label={selected.length === 0 ? 'Choose at least one' : `Continue with ${selected.length}`}
        disabled={selected.length === 0}
        onPress={onContinue}
      />
    </Screen>
  );
}
