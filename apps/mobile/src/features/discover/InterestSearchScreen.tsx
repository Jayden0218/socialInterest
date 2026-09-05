import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { InterestRef } from '@sih/shared';
import { theme } from '../../ui/theme';
import { EmptyState, Screen } from '../../ui/primitives';
import { labelWithParent } from './InterestScreen';

/**
 * FR-026: results appear as the person types, across both levels, each
 * sub-interest labelled with its parent — "portraits" under Photography must be
 * distinguishable from "portraits" under Painting.
 */
export const TYPEAHEAD_DEBOUNCE_MS = 150;
export const MIN_QUERY_LENGTH = 1;

export function shouldQuery(input: string): boolean {
  return input.trim().length >= MIN_QUERY_LENGTH;
}

export function resultLabel(ref: InterestRef): string {
  return labelWithParent(ref);
}

export function InterestSearchScreen({
  query,
  results,
  onQueryChange,
  onSelect,
}: {
  query: string;
  results: InterestRef[];
  onQueryChange: (next: string) => void;
  onSelect: (interestId: string) => void;
}) {
  return (
    <Screen testID="interest-search-screen">
      <TextInput
        testID="interest-search-input"
        accessibilityLabel="Search interests"
        placeholder="Search interests"
        value={query}
        onChangeText={onQueryChange}
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: theme.color.border,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          fontSize: theme.font.md,
          color: theme.color.text,
        }}
      />

      {shouldQuery(query) && results.length === 0 ? (
        <EmptyState
          testID="search-empty"
          title="No interests match"
          body="Try a shorter word, or create a sub-interest for it."
        />
      ) : (
        <FlatList
          testID="interest-list"
          data={results}
          keyExtractor={(i) => i.interestId}
          contentContainerStyle={{ gap: theme.space.sm }}
          renderItem={({ item, index }) => (
            <Pressable
              testID={`search-result-${index}`}
              accessibilityRole="button"
              onPress={() => onSelect(item.interestId)}
              style={{ paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.color.border }}
            >
              {/* Always parent-qualified, so two same-named interests are distinguishable. */}
              <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{resultLabel(item)}</Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
