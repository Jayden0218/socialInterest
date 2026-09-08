import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { activePalette as palette, MIN_TOUCH_TARGET, radius, space, textStyle, type } from './theme';

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
    variant === 'primary' ? palette.intent.accent : variant === 'danger' ? palette.intent.danger : palette.bg.raised;
  const fg = variant === 'secondary' ? palette.text.primary : palette.text.onAccent;
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
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
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
          ...textStyle.label,
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
      ? palette.intent.danger
      : tone === 'warning'
        ? palette.intent.warning
        : palette.line.strong;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: border,
        backgroundColor: palette.bg.raised,
        padding: space.md,
        borderRadius: radius.md,
      }}
    >
      <Text
        style={{
          color: palette.text.primary,
          ...textStyle.body,
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
          ...textStyle.title,
          fontWeight: type.title.weight,
          color: palette.text.primary,
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
          ...textStyle.body,
          color: palette.text.secondary,
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, ...style }}>
      {children}
    </View>
  );
}

/**
 * 006/FR-020, and a defect a DEVICE found: `scroll`.
 *
 * `Screen` was a plain `View`, so anything taller than the display was simply
 * unreachable - no scroll, no indication, the control just not there. Emulator
 * run 35 failed `09-report-and-block` on `block-person is visible`, and the
 * measurement (`browser/safety-fit.spec.ts`) puts that button's bottom edge at
 * 665px on a 640px-tall screen.
 *
 * 006 made it worse and did not cause it. With pre-006 line metrics the same
 * button measured 627 - inside 640 by THIRTEEN PIXELS. The type scale's line
 * heights added ~38px and pushed it out; a longer block warning, a larger font
 * setting or a shorter phone would each have done the same on their own.
 *
 * Off by default, deliberately. A `ScrollView` around a `FlatList` breaks
 * virtualisation and React Native says so loudly, and most screens here own a
 * list that already scrolls. This is for the ones whose content is STATIC and
 * can still outgrow the display - a sheet of options, a form.
 */
export function Screen({
  children,
  testID,
  scroll = false,
}: {
  children: React.ReactNode;
  testID?: string;
  scroll?: boolean;
}) {
  const style = { backgroundColor: palette.bg.base, padding: space.lg, gap: space.lg };
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: palette.bg.base }}
        // The gap and padding belong to the CONTENT, not the viewport: put them
        // on the ScrollView itself and the last child is clipped by the padding
        // instead of scrolled to.
        contentContainerStyle={{ ...style, flexGrow: 1 }}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View testID={testID} style={{ flex: 1, ...style }}>
      {children}
    </View>
  );
}
