/**
 * PostDetailContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { space } from '../ui/theme';
import { Button, Row } from '../ui/primitives';
import type { Post } from '@sih/shared';
import { PostDetailScreen } from '../features/posts/PostDetailScreen';
import { EngagementBar, type EngagementState } from '../features/engagement/EngagementBar';
import { ActionSheet } from '../ui/ActionSheet';
import { SafetyActions } from '../features/safety/SafetyActions';
import { useData } from '../data-provider';
import { DataError, type Collection } from '../data';
import { Failed } from './shared';

export function PostDetailContainer({
  postId,
  onOpenComments,
  onOpenPlace,
  onReport,
  onShare,
  onEdit,
  onOpenAuthor,
  onOpenInterest,
}: {
  postId: string;
  onOpenComments: (postId: string) => void;
  /** 004/FR-023. */
  onOpenPlace?: (placeId: string) => void;
  /**
   * The author's handle comes from here rather than from the caller, because
   * this is where the post is. Without it SafetyActions renders no Block
   * control at all (FR-044) - so blocking was unreachable on a device even
   * though the screen and the data call both existed.
   */
  onReport: (postId: string, authorHandle: string) => void;
  onShare: (postId: string) => void;
  onEdit: (postId: string) => void;
  /**
   * T053. Without a route here, ProfileContainer could only ever be reached
   * for your own profile from the "You" tab - so even a working follow control
   * had nothing to follow. This is the only place in the app where another
   * person is named.
   */
  onOpenAuthor?: (handle: string) => void;
  /** 007/FR-017, gate G2. The interest space, one tap from the post. */
  onOpenInterest?: (interestId: string) => void;
}) {
  const data = useData();
  const [saved, setSaved] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<EngagementState>({
    reactionCount: 0,
    commentCount: 0,
    viewerHasReacted: false,
  });
  // FR-012: only the author edits. The check is a convenience here - the server
  // refuses anyone else regardless - but showing the control to a person who
  // cannot use it is its own defect.
  const [isAuthor, setIsAuthor] = useState(false);
  // 012/T034. Whether the actions sheet is up.
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * 008/FR-040. NEITHER MAY LEAVE A TRACE ON ANY SCREEN.
   *
   * A dismissal and a mute are invisible by requirement — the person is not
   * told, and nothing on the surface changes — so a control that set a local
   * flag and sent nothing would satisfy every visible assertion. That is why
   * the device record reads the 204s out of the API aggregate rather than the
   * screen, and why these call the data layer directly here.
   *
   * Failures are swallowed for the same reason the place lookup's are: neither
   * is worth an error banner over a post somebody is reading, and both are
   * retried by doing it again.
   */
  const dismiss = useCallback(async () => {
    try {
      await data.safety.dismiss(postId);
    } catch {
      // Deliberate: see above.
    }
  }, [data, postId]);

  const mute = useCallback(async () => {
    if (!post) return;
    try {
      await data.safety.mute(post.author.handle);
    } catch {
      // Deliberate: see above.
    }
  }, [data, post]);

  useEffect(() => {
    let live = true;
    void data.session
      .me()
      .then((me) => live && post && setIsAuthor(me.userId === post.author.userId))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data, post]);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then((p) => {
        if (!live) return;
        setPost(p);
        setEngagement({
          reactionCount: p.reactionCount,
          commentCount: p.commentCount,
          viewerHasReacted: p.viewerHasReacted === true,
        });
        // 004/FR-037. From the SERVER's answer, not a local default - the react
        // control rendered unreacted on every load for a whole feature for
        // exactly this reason.
        setSaved(p.viewerHasSaved === true);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  const react = useCallback(() => {
    if (!post) return;
    // Optimistic, reconciled by the failure path: the server owns the count and
    // react/unreact are idempotent (FR-039), so a double tap cannot inflate it.
    const next = !engagement.viewerHasReacted;
    setEngagement((e) => ({
      ...e,
      viewerHasReacted: next,
      reactionCount: e.reactionCount + (next ? 1 : -1),
    }));
    const call = next ? data.engagement.react(postId) : data.engagement.unreact(postId);
    void call.catch(() => {
      setEngagement((e) => ({
        ...e,
        viewerHasReacted: !next,
        reactionCount: e.reactionCount + (next ? -1 : 1),
      }));
    });
  }, [data, post, postId, engagement.viewerHasReacted]);

  /**
   * 008/FR-049. The shelves this post can be filed onto.
   *
   * Read here rather than on the Saved screen alone, because a collection you
   * can create and never fill is this feature's own version of the defect 008
   * exists to end. A failed read leaves the controls absent, never the screen
   * broken.
   */
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => {
    let live = true;
    void data.saved
      .collections({ limit: 50 })
      .then((page) => live && setCollections(page.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * FR-049, FR-051. Filing is ADDITIVE: the star stays lit, because the server
   * writes the membership row and the save in one transaction. Setting `saved`
   * here rather than leaving it is not optimism about the collection — it is the
   * screen telling the truth about what the transaction did.
   */
  const fileInto = useCallback(
    async (collectionId: string) => {
      try {
        await data.saved.addToCollection(collectionId, postId);
        setSaved(true);
      } catch {
        // A post that cannot be seen cannot be filed; the control simply does
        // not take, exactly as the star does not.
      }
    },
    [data, postId],
  );

  /**
   * 004/FR-037. Optimistic, then reconciled against the server's refusal.
   *
   * Saving a post you cannot see is refused (404), so a failure has to put the
   * star back rather than leave it showing a save that did not happen.
   */
  const toggleSave = useCallback(async () => {
    const next = !saved;
    setSaved(next);
    try {
      await (next ? data.saved.save(postId) : data.saved.unsave(postId));
    } catch {
      setSaved(!next);
    }
  }, [data, postId, saved]);

  if (error) return <Failed message={error} />;
  if (!post) return <View testID="post-loading" />;

  return (
    <View style={{ flex: 1 }}>
      {/*
        008/FR-030. A mention opens the same person surface a byline does, so a
        reader cannot end up on two different screens for one person.
      */}
      <PostDetailScreen
        post={post}
        {...(onOpenPlace ? { onOpenPlace } : {})}
        {...(onOpenInterest ? { onOpenInterest } : {})}
        {...(onOpenAuthor ? { onOpenPerson: onOpenAuthor } : {})}
      />
      {/* Reacting had no control anywhere in the app: EngagementBar existed,
          was render-tested, and was never mounted. FR-039 was unreachable. */}
      <EngagementBar
        state={engagement}
        onReact={react}
        onOpenComments={() => onOpenComments(postId)}
        onShare={() => onShare(postId)}
        collections={collections.map((c) => ({ collectionId: c.collectionId, name: c.name }))}
        onFile={(collectionId) => void fileInto(collectionId)}
        saved={saved}
        onToggleSave={() => void toggleSave()}
      />
      <Row style={{ padding: space.sm, gap: space.sm }}>
        {onOpenAuthor ? (
          <Button
            testID="open-author"
            label={`@${post.author.handle}`}
            variant="secondary"
            onPress={() => onOpenAuthor(post.author.handle)}
          />
        ) : null}
        {/*
          012/T034. THE ACTIONS MOVED INTO A SHEET, and `open-safety` is what
          opens it.

          The id is unchanged deliberately: six Maestro flows and two browser
          journeys press it to reach reporting, and the preservation contract is
          about the id and what it MARKS (006/FR-027) — it still marks the one
          way from a post to the safety actions. What changed is that reporting
          is no longer the only thing behind it. "Not interested" and "Mute"
          existed on the safety screen and were reachable only by pressing a
          button labelled Report, which is a strange thing to ask of somebody
          who wants neither.

          Labelled "More", not an unlabelled `⋯`: Constitution IV is that safety
          gets easier to reach, never harder, and T034 names the bare glyph as
          the thing to avoid.
        */}
        <Button
          testID="open-safety"
          label="More"
          variant="secondary"
          onPress={() => setSheetOpen(true)}
        />
        {isAuthor ? (
          <Button
            testID="open-edit-post"
            label="Edit"
            variant="secondary"
            onPress={() => onEdit(postId)}
          />
        ) : null}
      </Row>

      <ActionSheet
        testID="post-actions"
        visible={sheetOpen}
        caption="This post"
        onClose={() => setSheetOpen(false)}
        actions={[
          { key: 'share', icon: 'share', label: 'Share', onPress: () => onShare(postId) },
          {
            key: 'save',
            icon: 'save',
            label: saved ? 'Remove from saved' : 'Save to a collection',
            onPress: () => void toggleSave(),
          },
          /*
            008/FR-040. "Not interested" and "Mute" are the two quieter options,
            and the artboard puts them ABOVE the report — somebody who wants
            less of a person should meet those before they meet the formal
            route. Both are the author's own post, so neither is offered on it.
          */
          ...(isAuthor
            ? []
            : ([
                {
                  key: 'dismiss',
                  icon: 'close',
                  label: 'Not interested',
                  onPress: () => void dismiss(),
                },
                {
                  key: 'mute',
                  icon: 'profile',
                  label: `Mute @${post.author.handle}`,
                  onPress: () => void mute(),
                },
                {
                  key: 'report',
                  icon: 'activity',
                  label: 'Report post',
                  destructive: true,
                  onPress: () => onReport(postId, post.author.handle),
                },
              ] as const)),
        ]}
      />
    </View>
  );

}
