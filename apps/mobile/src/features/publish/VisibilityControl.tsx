import { Pressable, Text, View } from 'react-native';
import type { Visibility } from '@sih/shared';
import { activePalette as palette, radius, space, touchTarget, type } from '../../ui/theme';

export interface VisibilityControlProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
}

/** FR-013: the default is public, and it is the value the control starts on. */
export const DEFAULT_VISIBILITY: Visibility = 'public';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Anyone can see this, including people who are signed out' },
  { value: 'followers', label: 'Followers', hint: 'Only people who follow you' },
  { value: 'private', label: 'Only me', hint: 'Nobody else can see this' },
];

export function VisibilityControl({ value, onChange }: VisibilityControlProps) {
  return (
    <View testID="visibility-control" style={{ gap: space.sm }}>
      <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>Who can see this</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {VISIBILITY_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`visibility-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityHint={option.hint}
              onPress={() => onChange(option.value)}
              style={{
        ...touchTarget,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? palette.intent.accent : palette.line.hairline,
                backgroundColor: selected ? palette.intent.accent : palette.bg.base,
              }}
            >
              <Text style={{ color: selected ? palette.text.onAccent : palette.text.primary, fontSize: type.caption.size }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* The hint is always shown, so the consequence of the choice is visible
          before publishing rather than discovered afterwards. */}
      <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
        {VISIBILITY_OPTIONS.find((o) => o.value === value)?.hint}
      </Text>
    </View>
  );
}
