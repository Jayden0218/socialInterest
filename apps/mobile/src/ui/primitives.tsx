import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { MIN_TOUCH_TARGET, theme } from './theme';

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testID?: string;
}) {
  const bg =
    variant === 'primary' ? theme.color.accent : variant === 'danger' ? theme.color.danger : theme.color.surface;
  const fg = variant === 'secondary' ? theme.color.text : theme.color.onAccent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      // Disabled state is exposed to assistive tech, not only rendered grey.
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: bg,
        opacity: disabled ? 0.45 : 1,
        paddingVertical: theme.space.md,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        /**
         * 006/FR-020. An explicit floor, not padding that happens to add up.
         *
         * Padding plus a line height is ~46 today, which is a number that moves
         * whenever the type scale does. A minimum states the requirement instead
         * of coincidentally meeting it.
         */
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: fg, fontSize: theme.font.md, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  tone,
  children,
  testID,
}: {
  tone: 'info' | 'warning' | 'danger';
  children: string;
  testID?: string;
}) {
  const border =
    tone === 'danger' ? theme.color.danger : tone === 'warning' ? '#d97706' : theme.color.border;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: border,
        backgroundColor: theme.color.surface,
        padding: theme.space.md,
        borderRadius: theme.radius.sm,
      }}
    >
      <Text style={{ color: theme.color.text, fontSize: theme.font.sm }}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ padding: theme.space.xl, alignItems: 'center', gap: theme.space.md }}>
      <Text style={{ fontSize: theme.font.lg, fontWeight: '600', color: theme.color.text }}>{title}</Text>
      <Text style={{ fontSize: theme.font.md, color: theme.color.muted, textAlign: 'center' }}>{body}</Text>
      {actionLabel ? <Button label={actionLabel} onPress={onAction} testID="empty-state-action" /> : null}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, ...style }}>
      {children}
    </View>
  );
}

export function Screen({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: theme.color.bg, padding: theme.space.lg, gap: theme.space.lg }}>
      {children}
    </View>
  );
}
