/**
 * CreatePlaceContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useState } from 'react';
import { CreatePlaceScreen } from '../features/places/CreatePlaceScreen';
import type { PlaceCategory, PlaceSummary } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

/**
 * FR-013, FR-014.
 *
 * A 409 is not an error here: it carries the existing place, and the screen
 * offers it. Treating the duplicate as a failure is what makes somebody type a
 * slightly different name and create the duplicate anyway.
 */
export function CreatePlaceContainer({
  initialName,
  initialLocality,
  onCreated,
}: {
  initialName?: string;
  initialLocality?: string;
  onCreated: (place: PlaceSummary) => void;
}) {
  const data = useData();
  const [draft, setDraft] = useState<{
    name: string;
    category: PlaceCategory;
    locality: string;
    address: string;
  }>({
    name: initialName ?? '',
    category: 'restaurant',
    locality: initialLocality ?? '',
    address: '',
  });
  const [existing, setExisting] = useState<PlaceSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSaving(true);
    setExisting(null);
    try {
      const place = await data.places.create({
        name: draft.name.trim(),
        category: draft.category,
        locality: draft.locality.trim(),
        ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
      });
      onCreated(place);
    } catch (err) {
      const problem = err instanceof DataError ? (err.problem as unknown as PlaceSummary) : null;
      if (err instanceof DataError && err.status === 409 && problem?.placeId) {
        setExisting(problem);
      } else {
        setError(err instanceof DataError ? err.problem.title ?? 'Could not create' : 'Could not create');
      }
    } finally {
      setSaving(false);
    }
  }, [data, draft, onCreated]);

  if (error) return <Failed message={error} />;
  return (
    <CreatePlaceScreen
      name={draft.name}
      category={draft.category}
      locality={draft.locality}
      address={draft.address}
      existing={existing}
      saving={saving}
      onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
      onSubmit={() => void submit()}
      onUseExisting={onCreated}
    />
  );
}
