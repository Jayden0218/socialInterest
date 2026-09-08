import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { activePalette as palette, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
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
    <Screen testID="media-picker-screen" padded={false}>
      {/*
        `MediaPicker.dc.html` puts Next in the header. `media-continue` keeps
        its testID and its disabled rule; the LABEL changes from "Continue with
        2" to "Next" and the count moves onto the tiles, where the artboard puts
        it — a numbered badge on each chosen photo says which two, which a
        number in a button never did.
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
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>Recents</Text>
        <Pressable
          testID="media-continue"
          accessibilityRole="button"
          accessibilityLabel={
            selected.length === 0 ? 'Choose at least one' : `Next with ${selected.length} chosen`
          }
          accessibilityState={{ disabled: selected.length === 0 }}
          disabled={selected.length === 0}
          onPress={onContinue}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          <Text
            style={{
              ...textStyle.body,
              fontWeight: '600',
              color: selected.length === 0 ? palette.text.muted : palette.intent.accent,
            }}
          >
            Next
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }}>
        <Text style={{ ...textStyle.caption, color: palette.text.muted }}>{MEDIA_LIMITS_HINT}</Text>

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

      </View>

      {/*
        FOUR COLUMNS AT 3PT GUTTERS, per the artboard: a picker is a contact
        sheet, and three big tiles with 8pt gaps shows nine photos where four
        columns shows sixteen. Choosing is comparing, and you cannot compare
        what is not on the screen.
      */}
      <FlatList
        numColumns={4}
        data={available}
        keyExtractor={(m) => m.uri}
        columnWrapperStyle={{ gap: 3 }}
        contentContainerStyle={{ gap: 3 }}
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
            style={{ flex: 1, aspectRatio: 1, overflow: 'hidden' }}
          >
            <Image source={{ uri: item.uri }} style={{ flex: 1 }} accessibilityIgnoresInvertColors />
            {isSelected(item) ? (
              <>
                <View
                  style={{
                    ...({ position: 'absolute' } as const),
                    inset: 0,
                    borderWidth: 3,
                    borderColor: palette.intent.accent,
                  }}
                />
                {/*
                  The artboard's numbered badge. It says WHICH ONE IS FIRST,
                  which matters because the order chosen is the order published
                  and nothing else on this screen ever said so.
                */}
                <View
                  style={{
                    ...({ position: 'absolute' } as const),
                    right: 6,
                    top: 6,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: palette.intent.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...textStyle.small, fontWeight: '700', color: palette.text.onAccent }}>
                    {selected.findIndex((sel) => sel.uri === item.uri) + 1}
                  </Text>
                </View>
              </>
            ) : null}
          </Pressable>
        )}
      />

    </Screen>
  );
}
