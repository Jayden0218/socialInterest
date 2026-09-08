import { Text, TextInput, View } from 'react-native';
import type { PlaceCategory, PlaceSummary } from '@sih/shared';
import { activePalette as palette, space, type } from '../../ui/theme';
import { Banner, Button, Row, Screen } from '../../ui/primitives';

export const PLACE_CATEGORIES: { value: PlaceCategory; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'bar', label: 'Bar' },
  { value: 'shop', label: 'Shop' },
  { value: 'venue', label: 'Venue' },
  { value: 'outdoor', label: 'Outdoors' },
  { value: 'other', label: 'Something else' },
];

/**
 * FR-013, FR-014.
 *
 * `existing` is what a 409 carries back. It is rendered as an OFFER, not an
 * error: a duplicate refused with no way to attach the original is how the
 * duplicate gets created under a slightly different name instead.
 */
export function CreatePlaceScreen({
  name,
  category,
  locality,
  address,
  existing,
  saving,
  onChange,
  onSubmit,
  onUseExisting,
}: {
  name: string;
  category: PlaceCategory;
  locality: string;
  address: string;
  existing: PlaceSummary | null;
  saving?: boolean;
  onChange: (next: { name?: string; category?: PlaceCategory; locality?: string; address?: string }) => void;
  onSubmit: () => void;
  onUseExisting: (place: PlaceSummary) => void;
}) {
  const input = {
    borderWidth: 1,
    borderColor: palette.line.hairline,
    borderRadius: 8,
    color: palette.text.primary,
    padding: space.sm,
  };

  return (
    <Screen testID="create-place-screen">
      <View style={{ padding: space.sm, gap: space.sm }}>
        <TextInput
          testID="place-name-input"
          style={input}
          placeholder="Name"
          placeholderTextColor={palette.text.muted}
          value={name}
          onChangeText={(next) => onChange({ name: next })}
        />
        <TextInput
          testID="place-locality-field"
          style={input}
          placeholder="City or area"
          placeholderTextColor={palette.text.muted}
          value={locality}
          onChangeText={(next) => onChange({ locality: next })}
        />
        <TextInput
          testID="place-address-input"
          style={input}
          placeholder="Address (optional)"
          placeholderTextColor={palette.text.muted}
          value={address}
          onChangeText={(next) => onChange({ address: next })}
        />

        <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>Category</Text>
        <View style={{ gap: space.xs }}>
          {PLACE_CATEGORIES.map((c) => (
            <Button
              key={c.value}
              testID={`place-category-${c.value}`}
              label={c.label}
              variant={category === c.value ? 'primary' : 'secondary'}
              onPress={() => onChange({ category: c.value })}
            />
          ))}
        </View>

        {existing ? (
          <View testID="place-already-exists" style={{ gap: space.xs }}>
            <Banner tone="warning" testID="place-duplicate-warning">
              {`${existing.name} already exists in ${existing.locality}.`}
            </Banner>
            <Button
              testID="place-use-existing"
              label={`Use ${existing.name}`}
              onPress={() => onUseExisting(existing)}
            />
          </View>
        ) : null}

        <Row>
          <Button
            testID="place-submit"
            label={saving ? 'Creating…' : 'Create place'}
            disabled={name.trim().length === 0 || locality.trim().length === 0 || saving === true}
            onPress={onSubmit}
          />
        </Row>
      </View>
    </Screen>
  );
}
