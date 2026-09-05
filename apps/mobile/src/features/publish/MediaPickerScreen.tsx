import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { theme } from '../../ui/theme';
import { Button, Screen } from '../../ui/primitives';
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
}

export function MediaPickerScreen({ available, selected, onChange, onContinue }: MediaPickerScreenProps) {
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

      <FlatList
        numColumns={3}
        data={available}
        keyExtractor={(m) => m.uri}
        columnWrapperStyle={{ gap: theme.space.sm }}
        contentContainerStyle={{ gap: theme.space.sm }}
        renderItem={({ item, index }) => (
          <Pressable
            testID={`media-item-${index}`}
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
