import { Pressable, Text, View } from 'react-native';
import type { PublicProfile } from '@sih/shared';
import { MIN_TOUCH_TARGET, activePalette as palette, space, textStyle } from '../ui/theme';

/**
 * 008/FR-030, US9 — FINISHING AN @handle WHILE TYPING.
 *
 * The trailing partial handle, or null. Only a handle being typed AT THE END of
 * the text counts: suggesting for one in the middle would replace text the
 * person has already moved past, and a composer that edits behind the cursor is
 * worse than one that suggests nothing.
 */
export function trailingMention(text: string): string | null {
  const match = /(?:^|[^A-Za-z0-9_@.])@([a-z0-9_]{1,30})$/i.exec(text);
  return match ? (match[1] ?? '').toLowerCase() : null;
}

/** Replaces that trailing partial with the chosen handle, plus a space. */
export function completeMention(text: string, handle: string): string {
  return text.replace(/@[a-z0-9_]{1,30}$/i, `@${handle} `);
}

export function MentionSuggest({
  people,
  onChoose,
}: {
  people: PublicProfile[];
  onChoose: (handle: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <View testID="mention-suggest" style={{ gap: space.xs }}>
      {people.map((p) => (
        <Pressable
          key={p.handle}
          testID={`mention-suggest-${p.handle}`}
          accessibilityRole="button"
          accessibilityLabel={`Mention ${p.displayName}`}
          onPress={() => onChoose(p.handle)}
          // A row in a list of choices is a whole-row target and still has to
          // BE 44 tall — 007 measured the interest word at 36.7 under a comment
          // claiming otherwise.
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          <Text style={{ ...textStyle.body, color: palette.text.primary }}>
            {`${p.displayName} @${p.handle}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
