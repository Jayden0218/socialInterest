import { Text, TextInput, View } from 'react-native';
import type { PlaceSummary } from '@sih/shared';
import { theme } from '../../ui/theme';
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
    borderColor: theme.color.border,
    borderRadius: 8,
    color: theme.color.text,
    padding: theme.space.sm,
  };

  if (selected) {
    return (
      <View testID="place-selected">
        <Row style={{ alignItems: 'center', gap: theme.space.sm }}>
          <Text style={{ flex: 1, color: theme.color.text }}>
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
    <View testID="place-picker" style={{ gap: theme.space.sm }}>
      <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
        Add a place (optional)
      </Text>
      <TextInput
        testID="place-locality-input"
        style={input}
        placeholder="City or area"
        placeholderTextColor={theme.color.muted}
        value={locality}
        onChangeText={onLocalityChange}
      />
      <TextInput
        testID="place-search-input"
        style={input}
        placeholder="Restaurant, cafe, shop…"
        placeholderTextColor={theme.color.muted}
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
