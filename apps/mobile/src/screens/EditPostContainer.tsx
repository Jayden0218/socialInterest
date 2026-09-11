/**
 * EditPostContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { EditPostScreen, type EditPostDraft } from '../features/posts/EditPostScreen';
import { useData } from '../data-provider';
import { DataError } from '../data';
import type { InterestRef } from '@sih/shared';
import { Failed } from './shared';

/**
 * Edit or delete your own post (FR-011, FR-012).
 *
 * EditPostScreen was written and render-tested and never mounted, so a person
 * could publish a post and then never change or remove it - including narrowing
 * its visibility, which is the one edit FR-017 says must take effect everywhere
 * immediately.
 */
export function EditPostContainer({
  postId,
  onDone,
}: {
  postId: string;
  onDone: () => void;
}) {
  const data = useData();
  const [original, setOriginal] = useState<EditPostDraft | null>(null);
  const [draft, setDraft] = useState<EditPostDraft | null>(null);
  const [options, setOptions] = useState<InterestRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([data.posts.get(postId), data.interests.suggested().catch(() => null)])
      .then(([post, suggested]) => {
        if (!live) return;
        const d: EditPostDraft = {
          caption: post.caption ?? '',
          interests: post.interests,
          visibility: post.visibility,
        };
        setOriginal(d);
        setDraft(d);
        setOptions(suggested ? suggested.items : post.interests);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);


  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await data.posts.update(postId, {
        caption: draft.caption,
        interestIds: draft.interests.map((i) => i.interestId),
        visibility: draft.visibility,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [data, draft, postId, onDone]);

  const remove = useCallback(async () => {
    setSaving(true);
    try {
      await data.posts.remove(postId);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
      setSaving(false);
    }
  }, [data, postId, onDone]);

  if (error) return <Failed message={error} />;
  if (!draft || !original) return <View testID="edit-post-loading" />;
  return (
    <EditPostScreen
      draft={draft}
      original={original}
      interestOptions={options}
      saving={saving}
      onChange={setDraft}
      onSave={() => void save()}
      onDelete={() => void remove()}
    />
  );
}
