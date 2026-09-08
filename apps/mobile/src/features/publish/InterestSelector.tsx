import { FlatList, Pressable, Text, View } from 'react-native';
import type { InterestRef } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget, type } from '../../ui/theme';

export interface InterestSelectorProps {
  selected: InterestRef[];
  options: InterestRef[];
  onChange: (next: InterestRef[]) => void;
}

/**
 * FR-006: a post must be assigned to at least one interest. The compose screen
 * keeps publish disabled until one is chosen, so the refusal happens here rather
 * than as a server error the person has to interpret. The server enforces it
 * too — this is convenience, not the guarantee.
 */
export function canPublish(selected: InterestRef[]): boolean {
  return selected.length > 0;
}

const label = (ref: InterestRef): string => (ref.parent ? `${ref.name} · ${ref.parent.name}` : ref.name);

export function InterestSelector({ selected, options, onChange }: InterestSelectorProps) {
  const toggle = (ref: InterestRef): void => {
    const has = selected.some((s) => s.interestId === ref.interestId);
    onChange(has ? selected.filter((s) => s.interestId !== ref.interestId) : [...selected, ref]);
  };

  return (
    <View testID="interest-selector" style={{ gap: space.sm }}>
      <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
        {selected.length === 0 ? 'Choose an interest (required)' : 'Filed under'}
      </Text>
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
              {/* The parent is always shown: "portraits" under Photography must be
                  distinguishable from "portraits" under Painting (FR-026). */}
              <Text style={{ color: isSelected ? palette.text.onAccent : palette.text.primary, fontSize: type.caption.size }}>
                {label(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
