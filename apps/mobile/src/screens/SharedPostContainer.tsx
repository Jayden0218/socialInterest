/**
 * SharedPostContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Post } from '@sih/shared';
import { SharedPostScreen } from '../features/posts/SharedPostScreen';
import { useData } from '../data-provider';
import { DataError } from '../data';

/**
 * The screen someone lands on from a share link (FR-042).
 *
 * A share link grants nothing: resolution re-checks visibility every time, so
 * the same URL can open for one person and not another, and can stop opening
 * after the author narrows the post. That is exactly what this screen exists to
 * say - and it had no way of ever being reached, because the app had no concept
 * of being opened at a post.
 *
 * `status` is the HTTP status the resolution produced, so the screen can tell
 * "not for you" from "no longer there" rather than collapsing both into an
 * error (FR-042).
 */
export function SharedPostContainer({ postId, onJoin }: { postId: string; onJoin: () => void }) {
  const data = useData();
  const [status, setStatus] = useState<number | null>(null);
  const [post, setPost] = useState<Post | null>(null);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then((p) => {
        if (!live) return;
        setPost(p);
        setStatus(200);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setStatus(e instanceof DataError ? e.status : 0);
      });
    return () => {
      live = false;
    };
  }, [data, postId]);

  if (status === null) return <View testID="shared-post-loading" />;
  return <SharedPostScreen status={status} {...(post ? { post } : {})} onJoin={onJoin} />;
}

// ---------------------------------------------------------------- feature 004
