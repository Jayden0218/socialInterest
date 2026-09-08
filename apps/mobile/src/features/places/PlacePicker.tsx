import { Text, TextInput, View } from 'react-native';
import type { PlaceSummary } from '@sih/shared';
import { activePalette as palette, space, textStyle } from '../../ui/theme';
import { Button, Row } from '../../ui/primitives';

/**
 * FR-014. Matches appear WHILE TYPING, above the create action.
 *
 * The order on screen is the requirement: a create button offered first, with
 * matches below it, produces duplicates however good the matching is. SC-007
 * measures the matching; this file is where the ordering lives.
 */
export function PlacePicker({
  query,
  locality,
  matches,
  selected,
  onQueryChange,
  onLocalityChange,
  onSelect,
  onCreate,
}: {
  query: string;
  locality: string;
  matches: PlaceSummary[];
  selected: PlaceSummary | null;
  onQueryChange: (next: string) => void;
  onLocalityChange: (next: string) => void;
  onSelect: (place: PlaceSummary | null) => void;
  onCreate: () => void;
}) {
  const input = {
    borderWidth: 1,
    borderColor: palette.line.hairline,
    borderRadius: 8,
    color: palette.text.primary,
    padding: space.sm,
  };

  if (selected) {
    return (
      <View testID="place-selected">
        <Row style={{ alignItems: 'center', gap: space.sm }}>
          <Text style={{ flex: 1, color: palette.text.primary }}>
            {selected.name} · {selected.locality}
          </Text>
          <Button
            testID="place-clear"
            label="Remove"
            variant="secondary"
            onPress={() => onSelect(null)}
          />
        </Row>
      </View>
    );
  }

  return (
    <View testID="place-picker" style={{ gap: space.sm }}>
      <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
        Add a place (optional)
      </Text>
      <TextInput
        testID="place-locality-input"
        style={input}
        placeholder="City or area"
        placeholderTextColor={palette.text.muted}
        value={locality}
        onChangeText={onLocalityChange}
      />
      <TextInput
        testID="place-search-input"
        style={input}
        placeholder="Restaurant, cafe, shop…"
        placeholderTextColor={palette.text.muted}
        value={query}
        onChangeText={onQueryChange}
      />

      {/* Matches FIRST. See the note above - this order is the requirement. */}
      {matches.map((m) => (
        <Button
          key={m.placeId}
          testID={`place-match-${m.placeId}`}
          label={`${m.name} · ${m.locality}`}
          variant="secondary"
          onPress={() => onSelect(m)}
        />
      ))}

      {query.trim().length > 0 && locality.trim().length > 0 ? (
        <Button testID="place-create-new" label={`Create "${query.trim()}"`} onPress={onCreate} />
      ) : null}
    </View>
  );
}
