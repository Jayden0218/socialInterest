import { Pressable, Text, View } from 'react-native';
import { activePalette as palette, space, textStyle, type } from '../../ui/theme';
import { MIN_TOUCH_TARGET } from '../../ui/tokens';
import { Banner, Button, Field, Screen } from '../../ui/primitives';

/**
 * Create an account (011/FR-001, US1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE SUBMIT IS ABOVE THE FIELDS — AND THIS SCREEN HAS FOUR OF THEM
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Runs 39–41 were spent signed out because a submit fell below the fold once
 * the soft keyboard opened, on a screen that does not scroll. The guard written
 * to catch it measured against an invented keyboard height and passed through
 * two of those runs while the device failed identically — react-native-web has
 * no soft keyboard, so no browser measurement can supply that number.
 *
 * This is the screen where that lesson pays for itself. Four fields push the
 * fold much further up than sign-in's two ever did, and it does not matter: a
 * control above every field cannot be covered by a keyboard that opens below
 * them, at any keyboard height, under `adjustResize` and `adjustPan` alike.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE PASSWORD FLOOR IS SHOWN BEFORE SUBMISSION (FR-005)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Not only in a refusal. Being told the rule after being refused by it is the
 * form making somebody guess — and the text comes from the SAME constant the
 * server refuses by, so the screen and the refusal cannot drift. 004 recorded
 * two lists for one thing where "the duplicate is not a risk of drift, it IS
 * the drift".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REFUSAL NAMES ITS FIELD AND KEEPS THE REST (FR-007)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `fieldErrors` marks the one that was wrong. Nothing here clears a value:
 * somebody who chose a taken handle should not have to retype their email,
 * their name and their password to try a second one.
 */
export interface SignUpScreenProps {
  email: string;
  password: string;
  handle: string;
  displayName: string;
  /** The floor, from the server's own constant. Never a literal typed here. */
  passwordHint: string;
  submitting: boolean;
  error?: string | null;
  /** FR-007. Keyed by field name, as the server's problem document reports them. */
  fieldErrors?: Record<string, string>;
  onEmailChange: (next: string) => void;
  onPasswordChange: (next: string) => void;
  onHandleChange: (next: string) => void;
  onDisplayNameChange: (next: string) => void;
  onSubmit: () => void;
  /** FR-028. Back to sign-in, carrying the email already typed. */
  onSignIn: () => void;
}

export function SignUpScreen({
  email,
  password,
  handle,
  displayName,
  passwordHint,
  submitting,
  error,
  fieldErrors = {},
  onEmailChange,
  onPasswordChange,
  onHandleChange,
  onDisplayNameChange,
  onSubmit,
  onSignIn,
}: SignUpScreenProps) {
  const canSubmit =
    !submitting &&
    email.trim().length > 0 &&
    password.length > 0 &&
    handle.trim().length > 0 &&
    displayName.trim().length > 0;

  /**
   * A note under the field that was refused.
   *
   * Not a component: `verify-maestro-ids` reads testIDs off the leading literal
   * of a template in a `testID=` position, and a helper returning JSX with a
   * computed id hides the prefix entirely — which is what made 005's inbox row
   * take three attempts. The id stays in the JSX below.
   */
  const note = (field: string): string | undefined => fieldErrors[field];

  return (
    /**
     * NOT `scroll`, for the reason recorded on `SignInScreen`: run 36 turned
     * eight screens into ScrollViews from one measurement and took the device
     * pass from 18/19 to 1/19. A screen earns that prop through
     * `safety-fit.spec.ts`, not by resembling one that has it.
     */
    <Screen testID="sign-up-screen">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          paddingBottom: space.md,
        }}
      >
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>Create account</Text>
        <Button
          testID="sign-up-submit"
          label={submitting ? 'Creating…' : 'Create'}
          disabled={!canSubmit}
          onPress={onSubmit}
        />
      </View>

      <View style={{ gap: space.md }}>
        <Text
          style={{
            ...textStyle.display,
            fontWeight: type.display.weight,
            letterSpacing: -0.4,
            color: palette.text.primary,
          }}
        >
          Pick a name and you're in.
        </Text>

        <Field
          testID="sign-up-email"
          accessibilityLabel="Email address"
          value={email}
          onChangeText={onEmailChange}
          placeholder="Email address"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {note('email') ? (
          <Text testID="sign-up-email-error" style={{ ...textStyle.small, color: palette.intent.danger }}>
            {note('email')}
          </Text>
        ) : null}

        <Field
          testID="sign-up-password"
          accessibilityLabel="Password"
          value={password}
          onChangeText={onPasswordChange}
          placeholder="Password"
          secureTextEntry
          textContentType="newPassword"
        />
        {/*
          FR-005. Shown whether or not anything has been refused, and replaced by
          the refusal when there is one — so the rule is never absent and never
          stated twice at once.
        */}
        <Text
          testID="sign-up-password-hint"
          style={{ ...textStyle.small, color: note('password') ? palette.intent.danger : palette.text.muted }}
        >
          {note('password') ?? passwordHint}
        </Text>

        <Field
          testID="sign-up-handle"
          accessibilityLabel="Handle"
          value={handle}
          onChangeText={onHandleChange}
          placeholder="Handle"
        />
        {note('handle') ? (
          <Text testID="sign-up-handle-error" style={{ ...textStyle.small, color: palette.intent.danger }}>
            {note('handle')}
          </Text>
        ) : null}

        <Field
          testID="sign-up-display-name"
          accessibilityLabel="Name"
          value={displayName}
          onChangeText={onDisplayNameChange}
          placeholder="Name"
        />
        {note('displayName') ? (
          <Text
            testID="sign-up-display-name-error"
            style={{ ...textStyle.small, color: palette.intent.danger }}
          >
            {note('displayName')}
          </Text>
        ) : null}

        {error ? (
          <Banner testID="sign-up-error" tone="danger">
            {error}
          </Banner>
        ) : null}

        <Pressable
          testID="sign-up-to-sign-in"
          accessibilityRole="button"
          accessibilityLabel="Sign in instead"
          onPress={onSignIn}
          style={{ minWidth: MIN_TOUCH_TARGET, alignSelf: 'center' }}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text style={{ ...textStyle.body, color: palette.intent.accent, textAlign: 'center' }}>
            Sign in instead
          </Text>
        </Pressable>

        {/*
          FR-022. THERE IS NO "FORGOT YOUR PASSWORD" CONTROL HERE, and its
          absence is deliberate rather than unfinished.

          Reset is US4, a separately releasable slice, because it is the only
          part of this feature that needs an outside service to send mail. A
          control offered before the thing behind it exists is the
          declared-half-with-no-other-half shape this project has recorded seven
          times — a "Following" tab with no feed, a `readAt` nothing writes, a
          notification you could switch on that could never fire.
        */}
        <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
          By continuing you agree to the Terms and the Privacy Notice.
        </Text>
      </View>
    </Screen>
  );
}
