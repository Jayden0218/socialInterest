import { Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
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
    variant === 'primary' ? palette.intent.accent : variant === 'danger' ? palette.intent.danger : palette.bg.sunken;
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
        // 007: the artboards' button radius. A secondary button sits on the
        // FIELD surface rather than the card, because a white button on a white
        // card is a rectangle you have to look for.
        borderRadius: radius.button,
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

/**
 * 007 — THE CARD. White on the warm page, 14pt radius, no shadow.
 *
 * A primitive rather than a copied style object, because the depth model IS the
 * card: `bg.raised` on `bg.base`, the gutter, and the radius. Three properties
 * that must agree across twenty screens, and the version where each screen
 * writes them itself is the version where one of them ends up at radius 12.
 */
export function Card({
  children,
  testID,
  style,
}: {
  children: React.ReactNode;
  testID?: string;
  style?: ViewStyle;
}) {
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: palette.bg.raised,
        borderRadius: radius.card,
        padding: space.md,
        gap: space.sm,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

/**
 * 007 — A TEXT FIELD, on the sunken surface rather than behind a border.
 *
 * The artboards use a filled field at radius 21 with no outline. That is not a
 * style preference: an outlined field on a white card needs a border strong
 * enough to see, and every such border is another line competing with the
 * media, which is what made the rejected passes busy.
 *
 * `accessibilityLabel` is required rather than optional. A `TextInput` whose
 * only label is a placeholder is unlabelled the moment somebody types.
 */
export function Field({
  value,
  onChangeText,
  accessibilityLabel,
  placeholder,
  testID,
  multiline = false,
  maxLength,
  editable,
  style,
}: {
  value: string;
  onChangeText: (next: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  testID?: string;
  multiline?: boolean;
  maxLength?: number;
  /** 007/T052. A composer is disabled when the server says the viewer cannot send. */
  editable?: boolean;
  /** `TextStyle`, not `ViewStyle`: a field is text, and `textAlignVertical`
   *  is what keeps a multiline one from centring its first line on Android. */
  style?: TextStyle;
}) {
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? ''}
      placeholderTextColor={palette.text.muted}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      {...(maxLength === undefined ? {} : { maxLength })}
      {...(editable === undefined ? {} : { editable })}
      style={{
        backgroundColor: palette.bg.sunken,
        borderRadius: multiline ? radius.card : radius.field,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        minHeight: MIN_TOUCH_TARGET,
        color: palette.text.primary,
        ...textStyle.body,
        ...style,
      }}
    />
  );
}

/**
 * 007 — THE SCREEN HEADER: the screen's own name, left, with room for actions.
 *
 * Every artboard opens the same way and 006's screens each wrote their own
 * `<Text style={{...textStyle.display}}>`. One component is the same argument as
 * one `PostCard`: the places a heading can drift are the places it does.
 */
export function ScreenHeader({
  title,
  right,
  testID,
}: {
  title: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
      }}
    >
      {/*
        ONE LINE, ALWAYS — and this is a device-only defect.
        
        Run 46's emulator capture shows the Chats header rendering as "Chat" /
        "s", wrapped across two lines. The same screen measured in a browser at
        the same 320pt width puts it on one line 53.6pt wide with 158pt of
        slack, so no browser run could have found it: react-native-web does not
        use the platform's font metrics.
        
        `numberOfLines={1}` is the fix that does not depend on knowing WHY the
        native metrics differ. A screen title is a heading — if it genuinely
        cannot fit it should ellipsize, never reflow the header and shove the
        content down. Applied here rather than at the call site because every
        screen's title wants the same answer.
      */}
      <Text
        numberOfLines={1}
        style={{
          ...textStyle.display,
          fontWeight: type.display.weight,
          letterSpacing: -0.4,
          color: palette.text.primary,
          flexShrink: 1,
        }}
      >
        {title}
      </Text>
      {right ?? null}
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
 * OFF BY DEFAULT, AND APPLIED ONLY WHERE THE OVERFLOW IS MEASURED. I turned it
 * on for eight screens on a "same class of defect" argument having measured
 * exactly one, and run 36 came back 1/19: `SignInScreen` became a `ScrollView`
 * and sign-in stopped working, so every flow that chains it failed. The API log
 * is unambiguous - `GET /v1/me` 200 three times (all host-side fixtures, none
 * from the device) against 54 in run 35, and `/v1/feed/home` 401 twenty times.
 * The app was signed out for the entire run.
 *
 * Two mechanisms fit and both are the ScrollView's: a tap while the soft
 * keyboard is up is consumed to dismiss it rather than delivered to the button
 * (`keyboardShouldPersistTaps` defaults to `never`), and a scroll viewport
 * resized by the keyboard leaves the submit button below the fold where a plain
 * `View` would have moved it. `handled` addresses the first. Neither can be
 * reproduced in a browser, which has no soft keyboard - so the other seven
 * screens are REVERTED rather than fixed on a theory, and stay unmeasured until
 * something measures them.
 *
 * Also: a `ScrollView` around a `FlatList` breaks virtualisation, so a screen
 * that owns a list must never set this.
 */
export function Screen({
  children,
  testID,
  scroll = false,
  padded = true,
}: {
  children: React.ReactNode;
  testID?: string;
  scroll?: boolean;
  /**
   * 007. A screen whose content is a full-bleed list turns this OFF.
   *
   * The waterfall's gutter is its own — 12pt outside, 8pt between columns — and
   * a screen padding of 16 on top of it makes the columns 178pt wide on a 390pt
   * device instead of the design's 178. Rather than have the feed subtract the
   * padding back out with a negative margin, which is the version that breaks
   * silently on a different screen width, the screen simply does not add it.
   */
  padded?: boolean;
}) {
  const style = {
    backgroundColor: palette.bg.base,
    padding: padded ? space.lg : 0,
    paddingTop: space.lg,
    gap: padded ? space.lg : space.sm,
  };
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: palette.bg.base }}
        // The gap and padding belong to the CONTENT, not the viewport: put them
        // on the ScrollView itself and the last child is clipped by the padding
        // instead of scrolled to.
        contentContainerStyle={{ ...style, flexGrow: 1 }}
        // Without this a tap landing while the soft keyboard is up is spent
        // dismissing the keyboard instead of pressing what was tapped - the
        // default is `never`, and it is how run 36 lost sign-in.
        keyboardShouldPersistTaps="handled"
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
