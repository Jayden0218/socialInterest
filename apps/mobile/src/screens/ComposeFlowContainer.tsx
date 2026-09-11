/**
 * ComposeFlowContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useState } from 'react';
import { MediaPickerScreen, type PickedMedia } from '../features/publish/MediaPickerScreen';
import { useMediaLibrary } from '../features/publish/useMediaLibrary';
import { ComposeContainer } from './ComposeContainer';

/**
 * T038. The compose flow, starting where a person starts it: at their own media.
 *
 * `MediaPickerScreen` existed and nothing reached it - it was the last screen in
 * the app with no route to it, and compose took a bundled sample image instead.
 * So the first step of the core act was faked, and every publish journey began
 * one step in.
 *
 * The picker is now the first step, and the sample media remains the fallback
 * (T039): the browser journeys run this same code through react-native-web,
 * where there is no native gallery, and publish must still work end to end for
 * them. A refused permission is neither - it is explained, per FR-012.
 */
export function ComposeFlowContainer({ onPublished }: { onPublished: (postId: string) => void }) {
  const library = useMediaLibrary();
  const [selected, setSelected] = useState<PickedMedia[]>([]);
  const [picked, setPicked] = useState<PickedMedia[] | null>(null);

  if (picked) return <ComposeContainer media={picked} onPublished={onPublished} />;

  return (
    <MediaPickerScreen
      available={library.available}
      selected={selected}
      onChange={setSelected}
      onContinue={() => setPicked(selected)}
      libraryStatus={library.status}
      onOpenLibrary={() => void library.pick()}
    />
  );
}
