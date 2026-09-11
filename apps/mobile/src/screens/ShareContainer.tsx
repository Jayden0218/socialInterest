/**
 * ShareContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import type { PublicProfile } from '@sih/shared';
import { conversationTitle } from '../features/conversations/conversation-title';
import type { Post } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { ShareAction } from '../features/engagement/ShareAction';
import { Failed } from './shared';

/**
 * Share a post.
 *
 * ShareAction existed, carried the FR-041/FR-042 warning that a link grants
 * nothing, and was never mounted - so sharing was unreachable and the warning
 * was never shown to anyone.
 */
export function ShareContainer({ postId, onDone }: { postId: string; onDone: () => void }) {
  const data = useData();
  const [post, setPost] = useState<Post | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    { conversationId: string; displayName: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  /**
   * 008/FR-043, FR-044. The sharer's OWN account setting.
   *
   * A `public` post by a private account is evaluated by the `followers` rule,
   * so the sheet's "anyone can open this" — rendered as no warning at all —
   * became a promise the boundary does not keep the moment US13 shipped. Read
   * here rather than inferred from the post, because it is a property of the
   * ACCOUNT and the post says `public` either way.
   */
  const [authorIsPrivate, setAuthorIsPrivate] = useState(false);
  useEffect(() => {
    let live = true;
    void data.session
      .me()
      .then((me) => live && setAuthorIsPrivate(me.accountPrivacy === 'private'))
      // A failed read leaves the sheet as it was; it must never block sharing.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * 008/FR-011. People matching the query, for the recipient picker.
   *
   * A short query returns nothing rather than everybody: `A34` puts every person
   * in ONE partition sorted by handle, which `keys.ts` records as the honest
   * limit of that design, and a one-letter prefix would walk most of it.
   */
  useEffect(() => {
    const q = personQuery.trim();
    if (q.length < 2) {
      setPeople([]);
      return;
    }
    let live = true;
    void data.people
      .search(q, { limit: 5 })
      .then((page) => live && setPeople(page.items))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [data, personQuery]);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then(async (p) => {
        if (!live) return;
        setPost(p);
        const link = await data.posts.shareLink(postId);
        if (live) setUrl(link.url);
        // 004/FR-009. Accepted conversations only - sending a post into a
        // REQUEST would deliver content to somebody who has not agreed to hear
        // from you, which is the thing the request inbox exists to prevent.
        const inbox = await data.conversations.list({ state: 'accepted', limit: 10 });
        if (live) {
          setConversations(
            inbox.items.map((c) => ({
              conversationId: c.conversationId,
              displayName: conversationTitle(c),
            })),
          );
        }
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  const sendToConversation = useCallback(
    async (conversationId: string) => {
      await data.conversations.send(conversationId, { sharedPostId: postId });
      onDone();
    },
    [data, postId, onDone],
  );

  /**
   * 008/FR-011 — SEND TO SOMEBODY THERE IS NO CONVERSATION WITH YET.
   *
   * Two existing calls, no new endpoint: `open` derives the pair id and creates
   * the conversation as a REQUEST when the two have never spoken (FR-012), and
   * `send` carries the post reference. A dedicated send endpoint would be a
   * second way to write a message needing its own access check, which is the
   * two-predicates failure in a new place.
   */
  const sendToPerson = useCallback(
    async (handle: string) => {
      try {
        const conversation = await data.conversations.open(handle);
        await data.conversations.send(conversation.conversationId, { sharedPostId: postId });
        onDone();
      } catch {
        /**
         * 008/FR-014 — ONE NEUTRAL MESSAGE FOR EVERY REFUSAL.
         *
         * A block must not be distinguishable from any other reason this could
         * fail. Reporting the server's own text here would leak exactly what the
         * server took care to hide by answering `gone` rather than `not-for-you`.
         */
        setSendError('This post could not be sent to that person.');
      }
    },
    [data, postId, onDone],
  );

  /**
   * 008/FR-015 — THE PLATFORM SHARE MECHANISM, not `onDone`.
   *
   * `share-send` closed the sheet and did nothing else, so the app's Share
   * button has never shared anything anywhere. The link itself is unchanged and
   * still confers no access of its own (001/FR-042); this only hands it to the
   * place a person expects it to go.
   */
  const shareOutside = useCallback(async () => {
    try {
      await Share.share({ message: url ?? '' });
    } catch {
      // A dismissed share sheet rejects on some platforms. Nothing has gone
      // wrong and there is nothing to tell anyone.
    }
    onDone();
  }, [url, onDone]);

  if (error) return <Failed message={error} />;
  if (!post || url === null) return <View testID="share-loading" />;
  return (
    <ShareAction
      visibility={post.visibility}
      authorIsPrivate={authorIsPrivate}
      url={url}
      conversations={conversations}
      onCopy={onDone}
      onShare={() => void shareOutside()}
      onSendToConversation={(id) => void sendToConversation(id)}
      onSearchPeople={(q) => setPersonQuery(q)}
      people={people}
      onSendToPerson={(handle) => void sendToPerson(handle)}
      sendError={sendError}
    />
  );
}
