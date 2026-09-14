import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { activePalette as palette, space, textStyle, type } from '../../ui/theme';
import { MIN_TOUCH_TARGET } from '../../ui/tokens';
import { Banner, Button, Field, Screen } from '../../ui/primitives';

/**
 * Sign in with an email address and a password (011/FR-027).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY IT WAS NEVER A PRODUCT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Until 011 this screen asked for a TOKEN: a 244-character string a developer
 * minted with a script and handed over. That is correct for a device pass on a
 * CI runner and it is not something any consumer app has ever asked of anybody.
 * Every other capability was built — publishing, a ranked feed, comments,
 * follows, messages, saving, reporting, appeals, all of it verified on a
 * physical Android device — and the first screen still asked the person to do
 * the one thing they could not do.
 *
 * `pnpm token` still works and still mints credentials for device passes
 * (FR-026); it is simply no longer how a person gets in.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE SUBMIT IS ABOVE THE FIELDS. THIS IS AN INVARIANT, NOT A PREFERENCE.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Runs 39, 40 and 41 each spent about twenty minutes signed out because the
 * submit sat below the fold once the soft keyboard opened, on a screen that
 * deliberately does not scroll. The guard written to catch it measured against
 * an INVENTED constant — "a keyboard takes 250 points" — and passed through two
 * of those runs while the device failed identically, because react-native-web
 * has no soft keyboard and no browser measurement can ever supply that number.
 *
 * A control ABOVE the fields cannot be covered by a keyboard that opens below
 * them, at any keyboard height, under `adjustResize` and `adjustPan` alike.
 * **This screen now has two fields where it had one**, which moves the fold —
 * and cannot move a control that is above both. That is precisely what the
 * invariant was for.
 */
export interface SignInScreenProps {
  email: string;
  password: string;
  submitting: boolean;
  error?: string | null;
  onEmailChange: (next: string) => void;
  onPasswordChange: (next: string) => void;
  onSubmit: () => void;
  /** FR-028. Moving to sign-up carries the address already typed. */
  onCreateAccount: () => void;
  /**
   * The backend this app talks to (009/US1, FR-001).
   *
   * Both are optional TOGETHER: no handler means no field. A field with nothing
   * behind it would be a control that does nothing, which is the exact shape
   * this project keeps finding — a "Following" tab with no feed, a `readAt`
   * nothing writes, a follow button wired to `() => undefined`.
   *
   * The screen takes it as a PROP and never reads it from a store. The address
   * is read where the data layer is constructed and nowhere else
   * (`contracts/backend-address.md` §6), and
   * `address-is-not-a-permission.test.ts` scans this file to prove it.
   */
  address?: string;
  onAddressChange?: (next: string) => void;
  /**
   * True when this build already knows its backend (`ADDRESS_IS_COMPILED_IN`).
   *
   * Hides the address field behind a quiet control rather than removing it: the
   * address is a default, not a pin, and a build that cannot be re-pointed from
   * inside itself is unrecoverable when a laptop's lease moves.
   *
   * FR-029 — the address stays reachable and stops being part of the ordinary
   * path. Those are two requirements and this prop is where they meet.
   */
  addressFixed?: boolean;
}

export function SignInScreen({
  email,
  password,
  submitting,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onCreateAccount,
  address,
  onAddressChange,
  addressFixed = false,
}: SignInScreenProps) {
  const configurable = typeof onAddressChange === 'function';

  /**
   * Every hook stays above every return, per `hooks-before-return.test.ts`: a
   * hook after an early return is "Rendered more hooks than during the previous
   * render", and after the final one it is dead code that looks like a feature.
   */
  const [addressRevealed, setAddressRevealed] = useState(!addressFixed);
  const showAddressField = configurable && addressRevealed;
  const addressReady = !configurable || (address ?? '').trim().length > 0;
  const canSubmit =
    !submitting && email.trim().length > 0 && password.length > 0 && addressReady;

  return (
    /**
     * NOT `scroll`, and that is a measured decision rather than a default.
     *
     * Run 36 turned eight screens into ScrollViews on a rule inferred from ONE
     * measurement, and this screen is the one it broke: sign-in stopped working
     * and every flow chaining it failed, 18/19 down to 1/19. Two mechanisms fit
     * and neither is reproducible in a browser, so the seven unmeasured screens
     * were reverted. `screen-scrolls.test.ts` now covers only the case with a
     * measurement behind it, and `safety-fit.spec.ts` is how any other screen
     * earns the prop.
     */
    <Screen testID="sign-in-screen">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          paddingBottom: space.md,
        }}
      >
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>Sign in</Text>
        <Button
          testID="sign-in-submit"
          label={submitting ? 'Signing in…' : 'Sign in'}
          disabled={!canSubmit}
          onPress={onSubmit}
        />
      </View>

      <View style={{ gap: space.md }}>
        {/*
          The promise first, per `design/007-ui/SignIn.dc.html`. A sign-in
          screen that opens with a field and no sentence asks somebody to
          identify themselves to a product they have not been told about.
        */}
        <Text
          style={{
            ...textStyle.display,
            fontWeight: type.display.weight,
            letterSpacing: -0.4,
            color: palette.text.primary,
          }}
        >
          Things worth paying attention to.
        </Text>
        <Text style={{ ...textStyle.body, color: palette.text.secondary }}>
          Photos and video from people deep in the things they love.
        </Text>

        {showAddressField ? (
          <Field
            testID="sign-in-address"
            accessibilityLabel="Server address"
            value={address ?? ''}
            onChangeText={onAddressChange}
            placeholder="https://example.trycloudflare.com/v1"
          />
        ) : null}

        <Field
          testID="sign-in-email"
          accessibilityLabel="Email address"
          value={email}
          onChangeText={onEmailChange}
          placeholder="Email address"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Field
          testID="sign-in-password"
          accessibilityLabel="Password"
          value={password}
          onChangeText={onPasswordChange}
          placeholder="Password"
          secureTextEntry
          textContentType="password"
        />

        {error ? (
          <Banner testID="sign-in-error" tone="danger">
            {error}
          </Banner>
        ) : null}

        {/*
          FR-028. The email survives the move, which is the whole reason this is
          a control on the screen rather than a separate entry point: somebody
          who typed an address, was told it has no account, and has to type it
          again has been made to pay for the app's uncertainty.
        */}
        <Pressable
          testID="sign-in-create-account"
          accessibilityRole="button"
          accessibilityLabel="Create an account"
          onPress={onCreateAccount}
          style={{ minWidth: MIN_TOUCH_TARGET, alignSelf: 'center' }}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text style={{ ...textStyle.body, color: palette.intent.accent, textAlign: 'center' }}>
            Create an account
          </Text>
        </Pressable>

        {/*
          The way back, and the reason it is small rather than absent.

          Somebody whose server moved needs to say so from inside the app. A
          quiet control does that without making the first screen look like a
          settings page — and `hitSlop` gives it a real 44pt target while the
          text stays the size it looks, which is what that prop is for (007
          measured the interest word occupying 44 points of LAYOUT for a 16pt
          word, and it cost two visible posts per screen).
        */}
        {configurable && !addressRevealed ? (
          <Pressable
            testID="sign-in-change-server"
            accessibilityRole="button"
            accessibilityLabel="Use a different server"
            onPress={() => setAddressRevealed(true)}
            /**
             * 16pt line box + 14 + 14 = exactly 44 vertically, and a stated
             * `minWidth` rather than "the text looks wide enough" — the
             * touch-target guard does the arithmetic and registers this control
             * in SLOP_TARGETS, and it refused the first version for having a
             * width nothing enforced.
             */
            style={{ minWidth: MIN_TOUCH_TARGET, alignSelf: 'center' }}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
              Use a different server
            </Text>
          </Pressable>
        ) : null}

        <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
          By continuing you agree to the Terms and the Privacy Notice.
        </Text>
      </View>
    </Screen>
  );
}

/** Signed-out state for a surface that needs an identity. */
export function SignedOutNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Screen testID="signed-out">
      <View style={{ gap: space.md }}>
        <Text style={{ ...textStyle.body, color: palette.text.primary }}>Sign in to do this.</Text>
        <Button testID="signed-out-sign-in" label="Sign in" onPress={onSignIn} />
      </View>
    </Screen>
  );
}
