import { FlatList, Pressable, Text, View } from 'react-native';
import type { InterestRef } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget, type } from '../../ui/theme';
import { Field } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';

export interface InterestSelectorProps {
  selected: InterestRef[];
  options: InterestRef[];
  onChange: (next: InterestRef[]) => void;
  /**
   * 013/T017, FR-001, FR-002. WHAT THE PERSON TYPED.
   *
   * The whole point of the feature: somebody names what their photograph is
   * about instead of choosing from a list we own. Held by the container so it
   * can be sent as `interestNames` on publish.
   */
  typedName?: string;
  onTypedNameChange?: (next: string) => void;
  /**
   * 013/T021, FR-009, FR-010. What already exists that resembles the typed
   * name, offered so joining one is a single tap.
   *
   * The prior research is unambiguous that this moment is where sprawl is won
   * or lost: an interface that pushes toward existing terms, rather than one
   * that merely refuses novel ones. A bare refusal leaves a person retyping
   * variants until one is accepted, which is the opposite of the intent.
   */
  candidates?: InterestRef[];
  onJoinExisting?: (ref: InterestRef) => void;
}

/**
 * FR-006: a post must be assigned to at least one interest. The compose screen
 * keeps publish disabled until one is chosen, so the refusal happens here rather
 * than as a server error the person has to interpret. The server enforces it
 * too — this is convenience, not the guarantee.
 */
export function canPublish(selected: InterestRef[], typedName = ''): boolean {
  // 013/FR-005. A NAME COUNTS. The server takes `interestIds`, `interestNames`
  // or both and refuses neither — this mirrors that so the control is not
  // disabled while somebody has plainly said what the post is about.
  return selected.length > 0 || typedName.trim().length > 0;
}

// 013. Flat: names are globally unique, so there is nothing to disambiguate.
const label = (ref: InterestRef): string => ref.name;

export function InterestSelector({
  selected,
  options,
  onChange,
  typedName,
  onTypedNameChange,
  candidates,
  onJoinExisting,
}: InterestSelectorProps) {
  const toggle = (ref: InterestRef): void => {
    const has = selected.some((s) => s.interestId === ref.interestId);
    onChange(has ? selected.filter((s) => s.interestId !== ref.interestId) : [...selected, ref]);
  };

  return (
    <View testID="interest-selector" style={{ gap: space.sm }}>
      <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
        {selected.length === 0 && !typedName?.trim() ? 'What is this about? (required)' : 'Filed under'}
      </Text>

      {/*
        013/T017. THE FIELD COMES FIRST, AND THE SUGGESTIONS BELOW IT.
        Naming your own subject is the primary action; the row underneath is
        what already exists, offered so the obvious word is one tap away. The
        prior research found this is where sprawl is won or lost — an interface
        that pushes toward existing terms rather than one that only accepts them.
      */}
      {onTypedNameChange ? (
        <Field
          testID="interest-name-input"
          accessibilityLabel="Name this interest"
          placeholder="Bouldering, sourdough, birdwatching…"
          value={typedName ?? ''}
          onChangeText={onTypedNameChange}
        />
      ) : null}
      {candidates && candidates.length > 0 && onJoinExisting ? (
        <View testID="duplicate-candidates" style={{ gap: space.xs }}>
          <Text style={{ ...textStyle.caption, color: palette.text.secondary }}>
            These already exist. Join one instead?
          </Text>
          {candidates.map((c) => (
            <Pressable
              key={c.interestId}
              testID={`join-existing-${c.interestId}`}
              accessibilityRole="button"
              accessibilityLabel={`Join ${c.name}`}
              onPress={() => onJoinExisting(c)}
              style={{
                ...touchTarget,
                justifyContent: 'center',
                paddingHorizontal: space.md,
                borderRadius: radius.button,
                borderWidth: 1,
                borderColor: palette.intent.accent,
              }}
            >
              <Text style={{ color: palette.intent.accent, ...textStyle.body }}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        horizontal
        data={options}
        keyExtractor={(i) => i.interestId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm }}
        renderItem={({ item, index }) => {
          const isSelected = selected.some((s) => s.interestId === item.interestId);
          return (
            <Pressable
              testID={`interest-option-${index}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              onPress={() => toggle(item)}
              style={{
                ...touchTarget,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: isSelected ? palette.intent.accent : palette.line.hairline,
                backgroundColor: isSelected ? palette.intent.accent : palette.bg.base,
              }}
            >
              <Text style={{ color: isSelected ? palette.text.onAccent : palette.text.primary, ...textStyle.caption }}>
                {label(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
