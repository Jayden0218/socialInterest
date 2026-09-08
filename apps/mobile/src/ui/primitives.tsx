import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { activePalette, MIN_TOUCH_TARGET, radius, space, theme, type } from './theme';

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
      <Text
        style={{
          color: fg,
          fontSize: type.label.size,
          lineHeight: type.label.lineHeight,
          fontWeight: type.label.weight,
        }}
      >
        {label}
      </Text>
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
  /**
   * 006/FR-016. `#d97706` used to be written here, in the file that exists to
   * stop exactly that. It survived because the hard-coded-style guard is scoped
   * to `features/` - which is right, since `ui/` is where values are DEFINED -
   * and a literal hiding in the definition layer is the one place the guard
   * cannot look. Found by reading, not by a test.
   */
  const border =
    tone === 'danger'
      ? activePalette.intent.danger
      : tone === 'warning'
        ? activePalette.intent.warning
        : activePalette.line.strong;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: border,
        backgroundColor: activePalette.bg.raised,
        padding: space.md,
        borderRadius: radius.md,
      }}
    >
      <Text
        style={{
          color: activePalette.text.primary,
          fontSize: type.body.size,
          lineHeight: type.body.lineHeight,
        }}
      >
        {children}
      </Text>
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
    <View testID={testID} style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <Text
        style={{
          fontSize: type.title.size,
          lineHeight: type.title.lineHeight,
          fontWeight: type.title.weight,
          color: activePalette.text.primary,
        }}
      >
        {title}
      </Text>
      {/*
        `text.secondary`, not `muted`. An empty state's body is the sentence that
        tells a person what to do next - 001/FR-036 gives each surface its own
        wording for that reason - and setting it in the dimmest role available
        makes the most useful line on the screen the hardest one to read.
      */}
      <Text
        style={{
          fontSize: type.body.size,
          lineHeight: type.body.lineHeight,
          color: activePalette.text.secondary,
          textAlign: 'center',
        }}
      >
        {body}
      </Text>
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
