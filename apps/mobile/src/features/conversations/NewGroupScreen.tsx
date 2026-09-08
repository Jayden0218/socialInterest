import { FlatList, Text, TextInput, View } from 'react-native';
import type { PublicProfile } from '@sih/shared';
import { activePalette as palette, space } from '../../ui/theme';
import { Banner, Button, EmptyState, Row, Screen } from '../../ui/primitives';

/**
 * 005/FR-018, FR-024, FR-031.
 *
 * MAX_PARTICIPANTS is a copy of a server constant, and that is a duplicate of
 * exactly the kind this codebase has been bitten by twice. It is here anyway,
 * and the distinction is worth stating: the server refuses at 20 because
 * `TransactWriteItems` caps at 100 items and a group write is 1 meta + 2N rows
 * (41 at the cap). That refusal is the rule. This number only decides when the
 * button stops working, so the two disagreeing costs a confusing error message
 * rather than a wrong outcome - and SC-010 asserts the server refuses a raw
 * request that never went near this screen.
 *
 * The version of this that WOULD be a defect is a client that enforces the cap
 * INSTEAD of the server. That is what FR-031 forbids and what T105 checks.
 */
export const MAX_PARTICIPANTS = 20;

/** The creator counts. A group of 20 is the creator plus 19 others. */
export function canCreateGroup(selected: readonly string[]): boolean {
  return selected.length >= 1 && selected.length <= MAX_PARTICIPANTS - 1;
}

/**
 * Why the create button is not available, or null when it is.
 *
 * A disabled button with no explanation is the defect 004 shipped on the publish
 * screen: the upload silently never completed, the button stayed disabled, and
 * tapping it was a no-op that looked like a frozen app.
 */
export function groupNotice(selected: readonly string[]): string | null {
  if (selected.length === 0) return 'Choose at least one person.';
  if (selected.length > MAX_PARTICIPANTS - 1) {
    return `A group holds ${MAX_PARTICIPANTS} people, including you.`;
  }
  /**
   * FR-027 IS NOT AN ERROR, and saying so matters.
   *
   * One other person is a PAIR - the id is derived from the two of you, and the
   * server routes it to the conversation you already have. Somebody who picked
   * one person and expected a new empty thread should be told that, not left to
   * discover it when their old messages appear.
   */
  if (selected.length === 1) return 'With one person this opens your existing conversation.';
  return null;
}

export function NewGroupScreen({
  query,
  results,
  selected,
  name,
  creating,
  error,
  onQueryChange,
  onToggle,
  onNameChange,
  onCreate,
}: {
  query: string;
  results: PublicProfile[];
  /** Handles, in the order they were chosen, so the list reads predictably. */
  selected: PublicProfile[];
  name: string;
  creating?: boolean;
  error?: string | null;
  onQueryChange: (next: string) => void;
  onToggle: (person: PublicProfile) => void;
  onNameChange: (next: string) => void;
  onCreate: () => void;
}) {
  const handles = selected.map((p) => p.handle);
  const notice = groupNotice(handles);
  const blocking = !canCreateGroup(handles);

  return (
    <Screen testID="new-group-screen">
      <TextInput
        testID="group-name-input"
        style={inputStyle}
        placeholder="Group name (optional)"
        placeholderTextColor={palette.text.muted}
        value={name}
        onChangeText={onNameChange}
      />

      {selected.length > 0 ? (
        <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
          {selected.map((p) => (
            <Button
              key={p.handle}
              testID={`group-selected-${p.handle}`}
              label={`${p.displayName} ✕`}
              variant="secondary"
              onPress={() => onToggle(p)}
            />
          ))}
        </Row>
      ) : null}

      <TextInput
        testID="group-search-input"
        style={inputStyle}
        placeholder="Search people"
        placeholderTextColor={palette.text.muted}
        autoCapitalize="none"
        value={query}
        onChangeText={onQueryChange}
      />

      {results.length === 0 ? (
        <EmptyState
          testID="group-search-empty"
          title={query.trim() ? 'Nobody found' : 'Who is in this group?'}
          body={
            query.trim()
              ? 'Try a different name or handle.'
              : 'Search for people by name or handle, then tap to add them.'
          }
        />
      ) : (
        <FlatList
          testID="group-search-results"
          data={results}
          keyExtractor={(p) => p.handle}
          renderItem={({ item }) => {
            const chosen = handles.includes(item.handle);
            return (
              <Row style={{ paddingVertical: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text.primary, fontWeight: '600' }}>
                    {item.displayName}
                  </Text>
                  <Text style={{ color: palette.text.muted }}>@{item.handle}</Text>
                </View>
                <Button
                  testID={`group-participant-${item.handle}`}
                  label={chosen ? 'Added' : 'Add'}
                  variant={chosen ? 'primary' : 'secondary'}
                  onPress={() => onToggle(item)}
                />
              </Row>
            );
          }}
        />
      )}

      {/*
        The server's refusal, shown verbatim rather than replaced with a friendlier
        guess. FR-023 refuses a group containing a blocking pair WITHOUT naming who
        blocked whom, and a client that substituted its own copy here would be free
        to disclose exactly what the refusal was worded to withhold.
      */}
      {error ? (
        <Banner tone="danger" testID="new-group-error">
          {error}
        </Banner>
      ) : null}
      {!error && notice ? (
        <Banner tone="info" testID="new-group-notice">
          {notice}
        </Banner>
      ) : null}

      <Button
        testID="create-group"
        label={creating ? 'Creating…' : 'Create group'}
        disabled={blocking || creating === true}
        onPress={onCreate}
      />
    </Screen>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: palette.line.hairline,
  borderRadius: 8,
  color: palette.text.primary,
  padding: space.sm,
} as const;
