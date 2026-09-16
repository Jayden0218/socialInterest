import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Interest, InterestRef, PlaceSummary, PublicProfile } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget, MIN_TOUCH_TARGET } from '../../ui/theme';
import { interestColour } from '../../ui/interest-colour';
import { EmptyState, Row, Screen } from '../../ui/primitives';
import { labelWithParent } from './InterestScreen';
import { InterestTile } from './InterestTile';
import { Icon } from '../../ui/Icon';

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
  onCreatePlace,
  fallback,
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
  /** 012/FR-001. Rendered instead of the interest list; the fields stay put. */
  fallback?: React.ReactElement;
  /**
   * 012/T033, FR-015. Offered when a place search found nothing — the one path
   * `create-place` was designed to be reached from, and never had.
   */
  onCreatePlace?: (initialName: string, initialLocality: string) => void;
}) {
  const showPosts = mode === 'posts' && onSelectMode !== undefined;
  return (
    <Screen testID="interest-search-screen">
      <TextInput
        testID="interest-search-input"
        // The artboard's words, and the better ones: this searches all three.
        accessibilityLabel="Search interests, people and places"
        placeholder="Interests, people, places"
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

      {/*
        012/FR-031. ONE FIELD BEFORE ANYTHING IS TYPED.
        `Explore.dc.html` draws a single search field reading "Interests,
        people, places". This screen opened with TWO — an interest field and a
        locality field — which is the spec's complaint almost verbatim: "Explore
        opens with two empty text fields and asks you to type before it shows
        anything".

        The locality field is not deleted, because the reason it exists is still
        true and is written above: a place search without a locality cannot
        dedupe and returns the wrong "Joe's". It appears once somebody is
        actually searching, as a REFINEMENT of a search in progress rather than
        as a second thing to fill in before starting.
      */}
      {onLocalityChange && shouldQuery(query) ? (
        <TextInput
          testID="place-search-locality"
          accessibilityLabel="City or area, to search places"
          placeholder="City or area, to narrow places"
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
        {/*
          012/T033. "I looked for a place and it is not here" is the moment a
          person wants to add one, and until now there was nothing to press:
          `create-place` was a screen with no way in at all.

          Shown only when a real search came back empty — both fields filled
          and nothing found — because offering "Add a place" over a list of
          results is noise, and offering it before anything is typed asks
          somebody to name a place they have not looked for yet.
        */}
        {onCreatePlace && onSelectPlace && shouldQuery(query) && (locality ?? "").trim().length > 0 && places && places.length === 0 ? (
          <Pressable
            testID="create-place-from-search"
            accessibilityRole="button"
            onPress={() => onCreatePlace(query.trim(), (locality ?? "").trim())}
            style={{ paddingVertical: space.md, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
          >
            <Row style={{ alignItems: 'center', gap: space.sm }}>
              <Icon name="plus" size="action" color={palette.intent.accent} />
              <Text style={{ ...textStyle.body, color: palette.intent.accent }}>
                Add “{query.trim()}” as a place
              </Text>
            </Row>
          </Pressable>
        ) : null}

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

        {/*
          012/FR-001. `fallback` first: it carries loading and failed, which
          this screen had no way to express — `results.length === 0` cannot tell
          a catalogue that is still arriving from one that would not load, and
          said "No interests match" for both.

          The query-specific wording below survives, because it is the better
          sentence when a search genuinely matched nothing and the person can
          act on it by retyping.
        */}
        {fallback ?? (shouldQuery(query) && results.length === 0 ? (
          <EmptyState
            testID="search-empty"
            icon="search"
            title="No interests match"
            body="Try a shorter word, or create a sub-interest for it."
          />
        ) : (
          /*
            012/FR-031, FR-032. TILES AT REST, A LIST WHILE TYPING.

            Before anything is typed this is a BROWSE surface and the artboard
            draws it as a grid: a mosaic, the name, and how many posts are
            behind it. "Busy this week" is the heading, and the ordering is the
            server's — the listing is by name today, which is noted as open in
            the run record rather than quietly claimed.

            While typing it stays a LIST. A type-ahead is scanned top to bottom
            and a two-column grid of photographs is the wrong shape for that —
            and the preview is not sent for a query anyway, so every tile would
            be an empty mosaic.
          */
          shouldQuery(query) ? (
          <FlatList
            /*
              A `key` THAT DIFFERS FROM THE GRID'S, and React Native says why:
              "Changing numColumns on the fly is not supported. Change the key
              prop on FlatList when changing the number of columns."

              These read as two elements in the source and reconcile as ONE —
              same type, same position — so typing a character turned a
              two-column grid into a one-column list on the same instance and
              threw. Same family as 007's `onViewableItemsChanged`: a FlatList
              has invariants across renders that no single render can show you.
            */
            key="interest-list"
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
                      // 013/T026a. Flat: every interest has its own hue.
                      backgroundColor: interestColour({ interestId: item.interestId }, palette),
                    }}
                  />
                  {/* Always parent-qualified, so two same-named interests are distinguishable. */}
                  <Text style={{ ...textStyle.body, color: palette.text.primary }}>{resultLabel(item)}</Text>
                </Row>
              </Pressable>
            )}
          />
          ) : (
            <FlatList
              key="interest-tiles"
              testID="interest-tiles"
              data={results as Interest[]}
              keyExtractor={(i) => i.interestId}
              numColumns={2}
              columnWrapperStyle={{ gap: space.sm }}
              contentContainerStyle={{ gap: space.sm }}
              ListHeaderComponent={
                <Text
                  style={{ ...textStyle.caption, color: palette.text.muted, marginBottom: space.xs }}
                >
                  Busy this week
                </Text>
              }
              renderItem={({ item, index }) => (
                <InterestTile
                  // `search-result-<index>` is preserved: every Maestro flow and
                  // browser journey selects Explore's first result by it, and a
                  // layout change is not a reason to rename an id. 005 cost three
                  // attempts to a testID that moved.
                  testID={`search-result-${index}`}
                  interest={item}
                  onPress={() => onSelect(item.interestId)}
                />
              )}
            />
          )
        ))}
        </>
      )}
    </Screen>
  );
}
