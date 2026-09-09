import { FlatList, Pressable, Text, View } from 'react-native';
import type { PublicProfile } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, EmptyState, Field, Row, Screen } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';

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
    <Screen testID="new-group-screen" padded={false}>
      {/*
        `NewGroup.dc.html` puts Create in the HEADER, beside the title, rather
        than at the bottom of the screen. `create-group` keeps its testID and
        its disabled rule exactly - only where it sits changes.
      */}
      {/*
        THE NAME FIELD AND CREATE SHARE ONE ROW, and that is a measurement
        rather than a layout preference.

        `21-group-chat` types into the search field and then taps a RESULT, with
        the soft keyboard up. At 320x640 the layout that passed device runs 34
        and 37 put the second result at 245-289. My first rebuild put it at
        358-402 — a hundred and thirteen points lower — because a separate title
        header and a "SUGGESTED" row went in above the list. That is a
        regression I introduced, and it would have cost a run to discover.

        Merging the title row into the name row recovers the header's height
        while keeping `create-group` above the fold, which is the reason the
        header existed at all: at the BOTTOM of the screen it is the sign-in
        defect again, under the keyboard where nothing can reach it.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.xs,
        }}
      >
        <Field
          testID="group-name-input"
          accessibilityLabel="Group name (optional)"
          placeholder="Group name (optional)"
          value={name}
          onChangeText={onNameChange}
          style={{ flexGrow: 1, flexShrink: 1, borderRadius: radius.card, backgroundColor: palette.bg.raised, minHeight: 42 }}
        />
        <Pressable
          testID="create-group"
          accessibilityRole="button"
          accessibilityLabel={creating ? 'Creating group' : 'Create group'}
          accessibilityState={{ disabled: blocking || creating === true }}
          disabled={blocking || creating === true}
          onPress={onCreate}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center', alignItems: 'flex-end' }}
        >
          <Text
            style={{
              ...textStyle.body,
              fontWeight: '600',
              color: blocking || creating === true ? palette.text.muted : palette.intent.accent,
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.sm }}>

        {/*
          The artboard's removal chips. `group-selected-<handle>` is unchanged
          and still removes the person - it was a filled secondary button and is
          now the design's pill, which reads as "chosen, tap to undo" instead of
          as another action to take.
        */}
        {selected.length > 0 ? (
          <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
            {selected.map((p) => (
              <Pressable
                key={p.handle}
                testID={`group-selected-${p.handle}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.displayName}`}
                onPress={() => onToggle(p)}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingHorizontal: 6,
                  borderRadius: 17,
                  backgroundColor: palette.bg.sunken,
                }}
              >
                <Avatar userId={p.userId} displayName={p.displayName} url={p.avatarUrl} size={22} />
                <Text style={{ ...textStyle.label, color: palette.intent.accent }}>
                  {p.displayName}
                </Text>
                <Text style={{ ...textStyle.label, color: palette.intent.accent, paddingRight: 6 }}>✕</Text>
              </Pressable>
            ))}
          </Row>
        ) : null}

        <Field
          testID="group-search-input"
          accessibilityLabel="Search people"
          placeholder="Search people"
          value={query}
          onChangeText={onQueryChange}
          style={{ minHeight: 42 }}
        />

        {/*
          HIDDEN WHILE SEARCHING, for two reasons and the second one is measured.
          
          "Suggested" is simply wrong over a result set somebody just typed a
          query for. And the row costs about thirty points directly above the
          list — which matters because `21-group-chat` types into the search
          field and then taps a RESULT, with the soft keyboard up.
          
          Measured at 320x640: the layout that passed device runs 34 and 37 put
          the second result at 245-289. My rebuild put it at 358-402, a hundred
          and thirteen points lower, because a header and this row went in above
          it. That is a regression I introduced and would have cost a run.
        */}
        {query.trim() ? null : (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text
              style={{
                ...textStyle.caption,
                fontWeight: '700',
                letterSpacing: 0.7,
                color: palette.text.muted,
              }}
            >
              SUGGESTED
            </Text>
            {/*
              The cap, shown as a count rather than only as a refusal. It is the
              SERVER's rule (see MAX_PARTICIPANTS above) and this only says where
              you are against it.
            */}
            <Text style={{ ...textStyle.caption, fontWeight: '600', color: palette.text.muted }}>
              {`${selected.length} of ${MAX_PARTICIPANTS}`}
            </Text>
          </Row>
        )}
      </View>

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
              <Row style={{ paddingVertical: 9, paddingHorizontal: space.lg, gap: space.md }}>
                <Avatar userId={item.userId} displayName={item.displayName} url={item.avatarUrl} size={42} />
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
                  <Text style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary }}>
                    {item.displayName}
                  </Text>
                  <Text style={{ ...textStyle.caption, color: palette.text.muted }}>@{item.handle}</Text>
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

    </Screen>
  );
}
