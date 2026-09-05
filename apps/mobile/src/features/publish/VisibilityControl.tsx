import { Pressable, Text, View } from 'react-native';
import type { Visibility } from '@sih/shared';
import { theme } from '../../ui/theme';

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
    <View testID="visibility-control" style={{ gap: theme.space.sm }}>
      <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>Who can see this</Text>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
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
                paddingVertical: theme.space.sm,
                paddingHorizontal: theme.space.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: selected ? theme.color.accent : theme.color.border,
                backgroundColor: selected ? theme.color.accent : theme.color.bg,
              }}
            >
              <Text style={{ color: selected ? theme.color.onAccent : theme.color.text, fontSize: theme.font.sm }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* The hint is always shown, so the consequence of the choice is visible
          before publishing rather than discovered afterwards. */}
      <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
        {VISIBILITY_OPTIONS.find((o) => o.value === value)?.hint}
      </Text>
    </View>
  );
}
