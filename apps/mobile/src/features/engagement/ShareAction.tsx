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
export function shareWarning(visibility: Visibility): string | null {
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
  const warning = shareWarning(visibility);
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
            testID="share-person-search"
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
