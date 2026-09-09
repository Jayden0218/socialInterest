import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { InterestRef, PlaceSummary, PublicProfile } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget } from '../../ui/theme';
import { interestColour } from '../../ui/interest-colour';
import { EmptyState, Row, Screen } from '../../ui/primitives';
import { labelWithParent } from './InterestScreen';

/** 008/US6. Which of Discover's two searches is showing. */
export type SearchMode = 'interests' | 'posts';

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

/**
 * 004/US2 lives HERE rather than in a sixth tab.
 *
 * Five tabs is the ceiling (research R6), and one search across interests and
 * places is also the honest model: a person looking for "Tiong Bahru Bakery"
 * does not first decide whether it is an interest or a place. Places are shown
 * in their own section, and only when a locality is known - a place search
 * without one cannot dedupe and would return the wrong "Joe's".
 */
export function InterestSearchScreen({
  query,
  results,
  places,
  people,
  locality,
  mode = 'interests',
  posts,
  onQueryChange,
  onLocalityChange,
  onSelect,
  onSelectPlace,
  onSelectPerson,
  onSelectMode,
}: {
  query: string;
  results: InterestRef[];
  places?: PlaceSummary[];
  people?: PublicProfile[];
  locality?: string;
  /** 008/US6. Post search is a SECOND surface here, never a replacement. */
  mode?: SearchMode;
  /** Rendered under the Posts tab. A slot, so this screen owns no post code. */
  posts?: React.ReactNode;
  onQueryChange: (next: string) => void;
  onLocalityChange?: (next: string) => void;
  onSelect: (interestId: string) => void;
  onSelectPlace?: (placeId: string) => void;
  onSelectPerson?: (handle: string) => void;
  onSelectMode?: (next: SearchMode) => void;
}) {
  const showPosts = mode === 'posts' && onSelectMode !== undefined;
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
          borderColor: palette.line.hairline,
          borderRadius: radius.md,
          padding: space.md,
          ...textStyle.body,
          color: palette.text.primary,
        }}
      />

      {onLocalityChange ? (
        <TextInput
          testID="place-search-locality"
          accessibilityLabel="City or area, to search places"
          placeholder="City or area (to find places)"
          value={locality ?? ''}
          onChangeText={onLocalityChange}
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: palette.line.hairline,
            borderRadius: radius.md,
            padding: space.md,
            ...textStyle.body,
            color: palette.text.primary,
          }}
        />
      ) : null}

      {onSelectMode ? (
        <View testID="search-tabs" style={{ flexDirection: 'row', gap: space.xl }}>
          {(['interests', 'posts'] as const).map((m) => (
            <Pressable
              key={m}
              testID={`search-tab-${m}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => onSelectMode(m)}
              style={{ ...touchTarget, minWidth: undefined, alignItems: 'center', gap: 6 }}
            >
              <Text
                style={{
                  ...textStyle.body,
                  fontWeight: mode === m ? '600' : '500',
                  color: mode === m ? palette.text.primary : palette.text.muted,
                }}
              >
                {m === 'interests' ? 'Interests' : 'Posts'}
              </Text>
              {/* The rule marks the selected tab, rendered only under it, so the
                  two tabs cannot both look selected — 007's feed tabs, again. */}
              {mode === m ? (
                <View
                  style={{
                    width: 20,
                    height: 2.5,
                    borderRadius: radius.pill,
                    backgroundColor: palette.intent.accent,
                  }}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {showPosts ? (
        posts
      ) : (
        <>
        {places && places.length > 0 && onSelectPlace ? (
          <View testID="place-results" style={{ gap: space.xs }}>
            <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Places</Text>
            {places.map((p) => (
              <Pressable
                key={p.placeId}
                testID={`place-result-${p.placeId}`}
                accessibilityRole="button"
                onPress={() => onSelectPlace(p.placeId)}
                style={{ paddingVertical: space.sm }}
              >
                <Text style={{ ...textStyle.body, color: palette.text.primary }}>
                  {`${p.name} · ${p.category} · ${p.locality}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {people && people.length > 0 && onSelectPerson ? (
          <View testID="people-results" style={{ gap: space.xs }}>
            <Text style={{ ...textStyle.caption, color: palette.text.muted }}>People</Text>
            {people.map((p) => (
              <Pressable
                key={p.handle}
                testID={`person-result-${p.handle}`}
                accessibilityRole="button"
                onPress={() => onSelectPerson(p.handle)}
                style={{ paddingVertical: space.sm }}
              >
                <Text style={{ ...textStyle.body, color: palette.text.primary }}>
                  {`${p.displayName} · @${p.handle}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

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
            contentContainerStyle={{ gap: space.sm }}
            renderItem={({ item, index }) => (
              <Pressable
                testID={`search-result-${index}`}
                accessibilityRole="button"
                onPress={() => onSelect(item.interestId)}
                style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: palette.line.hairline }}
              >
                {/*
                  006/FR-013. The interest's own colour, beside its name.

                  A dot rather than a filled row: a list of saturated bars is
                  harder to read than the plain list it replaced, and the colour is
                  here to help someone recognise an interest they already know -
                  not to decorate. `resultLabel` stays exactly as it was, because
                  FR-014 means the NAME is what identifies the row and the colour
                  only narrows the search.
                */}
                <Row style={{ alignItems: 'center', gap: space.sm }}>
                  <View
                    testID={`search-result-colour-${index}`}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: radius.pill,
                      backgroundColor: interestColour(
                        { interestId: item.interestId, parentId: item.parent?.interestId ?? null },
                        palette,
                      ),
                    }}
                  />
                  {/* Always parent-qualified, so two same-named interests are distinguishable. */}
                  <Text style={{ ...textStyle.body, color: palette.text.primary }}>{resultLabel(item)}</Text>
                </Row>
              </Pressable>
            )}
          />
        )}
        </>
      )}
    </Screen>
  );
}
