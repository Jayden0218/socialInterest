import { Fragment } from 'react';
import { Text, type TextStyle } from 'react-native';
import { activePalette as palette } from '../ui/theme';

/**
 * 008/FR-030, US9 — @handle, RENDERED AS A LINK.
 *
 * TWO DIFFERENT THINGS ARE HAPPENING, and conflating them is the trap:
 *
 * - WHO WAS MENTIONED is decided on the server, at write time, and stored as
 *   user ids (`post.mentions`). That is what the notification went to, and a
 *   later handle change cannot re-point it (research R9).
 * - WHAT THE READER SEES is the caption as it was written. The link follows the
 *   VISIBLE TEXT, so a reader tapping `@ada` goes to whoever holds `ada`, which
 *   is what the words on the screen promise.
 *
 * An unknown handle stays plain text (FR-033) as far as the server is
 * concerned; here every handle-shaped span is tappable, because the app cannot
 * know which resolved and a link that goes to a "no such person" screen is a
 * smaller surprise than text that looks like a link and is not.
 */
const MENTION = /(^|[^A-Za-z0-9_@.])@([a-z0-9_]{2,30})/gi;

export interface MentionPart {
  text: string;
  handle: string | null;
}

/** Splits text into plain and mention parts, in order, losing no characters. */
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let index = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (start > index) parts.push({ text: text.slice(index, start), handle: null });
    const handle = match[2] ?? '';
    parts.push({ text: `@${handle}`, handle: handle.toLowerCase() });
    index = start + handle.length + 1;
  }
  if (index < text.length) parts.push({ text: text.slice(index), handle: null });
  return parts;
}

export function MentionText({
  text,
  style,
  testID,
  numberOfLines,
  onOpenPerson,
}: {
  text: string;
  style: TextStyle;
  testID?: string;
  numberOfLines?: number;
  onOpenPerson?: (handle: string) => void;
}) {
  const parts = splitMentions(text);
  return (
    <Text testID={testID} style={style} {...(numberOfLines ? { numberOfLines } : {})}>
      {parts.map((part, i) =>
        part.handle && onOpenPerson ? (
          <Text
            key={i}
            testID={`mention-${part.handle}`}
            accessibilityRole="link"
            // Nested `Text` rather than a Pressable: a Pressable inside text
            // breaks the line box, and 007 measured what an inline control does
            // to a card's layout — 43 points per card, which was the difference
            // between two posts visible and four.
            onPress={() => onOpenPerson(part.handle as string)}
            style={{ color: palette.intent.accent }}
          >
            {part.text}
          </Text>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </Text>
  );
}
