import { useState } from 'react';
import { Text, View } from 'react-native';
import type { PublicProfile, Visibility } from '@sih/shared';
import { activePalette as palette, space, textStyle } from '../../ui/theme';
import { Banner, Button, Field } from '../../ui/primitives';

/**
 * FR-041, FR-042. A share link grants nothing — it resolves against the post's
 * visibility every time. So the sheet warns BEFORE the person sends it, rather
 * than letting them find out from a confused recipient that the link did not
 * open.
 */
/**
 * 008/FR-044 — AND THIS COPY WAS WRONG THE MOMENT PRIVATE ACCOUNTS SHIPPED.
 *
 * A `public` post by a PRIVATE account is evaluated by the `followers` rule, so
 * "anyone can open this" — which is what `null` here renders as, silently —
 * became a promise the boundary does not keep. Nobody would have found it from
 * the code: the post's visibility really is `public` and this function really
 * does handle every case of it.
 *
 * 007 shipped a follow hint describing a WITHDRAWN requirement for exactly this
 * reason, and the lesson it recorded is the one that found this: when a rule
 * changes, grep the COPY, not only the code.
 */
export function shareWarning(
  visibility: Visibility,
  authorIsPrivate = false,
): string | null {
  if (visibility === 'public' && authorIsPrivate) {
    return 'Your account is private, so only people you have approved can open this link.';
  }
  switch (visibility) {
    case 'public':
      return null;
    case 'followers':
      return 'Only your followers can open this link.';
    case 'private':
      return 'This post is private. Nobody else can open this link.';
  }
}

export function isShareable(visibility: Visibility): boolean {
  return visibility !== 'private';
}

export function ShareAction({
  visibility,
  authorIsPrivate,
  url,
  conversations,
  onCopy,
  onShare,
  onSendToConversation,
  onSearchPeople,
  people,
  onSendToPerson,
  sendError,
}: {
  visibility: Visibility;
  /** 008/FR-043. The sharer's own account setting — see `shareWarning`. */
  authorIsPrivate?: boolean;
  url: string;
  /** 004/FR-009. Empty when there is nobody to send to yet. */
  conversations?: { conversationId: string; displayName: string }[];
  onCopy: () => void;
  onShare: () => void;
  onSendToConversation?: (conversationId: string) => void;
  /** 008/FR-011. Finds somebody there is no conversation with yet. */
  onSearchPeople?: (query: string) => void;
  people?: PublicProfile[];
  onSendToPerson?: (handle: string) => void;
  /**
   * 008/FR-014. A refusal, already made neutral by the caller.
   *
   * The message must not distinguish "blocked" from any other refusal, because
   * a distinguishable message IS the disclosure. The server reports a block as
   * `gone` for the same reason.
   */
  sendError?: string | null;
}) {
  const warning = shareWarning(visibility, authorIsPrivate === true);
  const [query, setQuery] = useState('');

  return (
    <View testID="share-action" style={{ gap: space.md }}>
      <Text testID="share-url" numberOfLines={1} style={{ ...textStyle.caption, color: palette.text.muted }}>
        {url}
      </Text>

      {warning ? (
        <Banner tone="warning" testID="share-warning">{warning}</Banner>
      ) : null}

      <Button testID="share-copy" label="Copy link" variant="secondary" onPress={onCopy} />
      <Button
        testID="share-send"
        label="Share"
        disabled={!isShareable(visibility)}
        onPress={onShare}
      />

      {sendError ? (
        <Banner tone="warning" testID="share-send-error">{sendError}</Banner>
      ) : null}

      {/*
        008/FR-011 — SEND TO SOMEBODY YOU HAVE NEVER MESSAGED.
        
        The sheet listed accepted conversations only, so a post could travel only
        to people you were already talking to. Searching for a person and sending
        opens a pair conversation as a REQUEST (FR-012), which is the existing
        rule rather than a new one: it must not become a way to push content at
        somebody who has not agreed to hear from the sender.
      */}
      {onSearchPeople && onSendToPerson ? (
        <View testID="share-to-person" style={{ gap: space.xs }}>
          <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Send to someone</Text>
          <Field
            /*
              `share-recipient-search`, NOT `share-person-search`.

              A Maestro selector is a REGEX, and a flow taps a recipient with
              `share-person-.*` because it cannot know the handle in advance.
              This field's old id matched that regex too - and, being rendered
              first, it was what the tap landed on. Emulator run 50 lost
              `26-send-post` to exactly that: the field was focused, no send was
              made, the sheet stayed open, and the whole run shows no refusal
              because nothing was ever sent. `verify-maestro-ids` could not see
              it either; it resolves `share-person-` as a dynamic prefix and had
              no reason to notice a literal sharing it.
            */
            testID="share-recipient-search"
            accessibilityLabel="Search people to send this post to"
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              onSearchPeople(next);
            }}
            placeholder="handle or name"
          />
          {(people ?? []).map((p) => (
            <Button
              key={p.userId}
              // The HANDLE, not the id: `verify-maestro-ids` reads the leading
              // literal of a template in a testID position, and a flow selecting
              // a person needs something it can predict.
              testID={`share-person-${p.handle}`}
              label={`${p.displayName} @${p.handle}`}
              variant="secondary"
              disabled={!isShareable(visibility)}
              onPress={() => onSendToPerson(p.handle)}
            />
          ))}
        </View>
      ) : null}

      {/*
        004/FR-009. Sending a post INTO a conversation is not the same as sharing
        a link: the post is a reference the recipient's own visibility is
        evaluated against at read time, so it can stop resolving later. The link
        warning above still applies for the same reason, which is why this sits
        under it rather than replacing it.
      */}
      {onSendToConversation && conversations && conversations.length > 0 ? (
        <View testID="share-to-conversations" style={{ gap: space.xs }}>
          <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Send to</Text>
          {conversations.map((c) => (
            <Button
              key={c.conversationId}
              testID={`share-to-${c.conversationId}`}
              label={c.displayName}
              variant="secondary"
              disabled={!isShareable(visibility)}
              onPress={() => onSendToConversation(c.conversationId)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
