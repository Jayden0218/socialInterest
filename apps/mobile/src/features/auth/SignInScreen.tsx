import { useState } from 'react';
import { Text, View } from 'react-native';
import { activePalette as palette, space, textStyle, type } from '../../ui/theme';
import { Banner, Button, Field, Screen } from '../../ui/primitives';

/**
 * Sign in on the `local` runtime profile.
 *
 * There is no hosted identity provider - `RUNTIME_PROFILE=local` issues its own
 * JWTs - so this takes a token directly rather than pretending to run an OAuth
 * flow that does not exist. When a real issuer arrives this screen is what gets
 * replaced, and nothing behind it changes: everything downstream only ever sees
 * `session.signIn(token)`.
 *
 * It is deliberately a screen and not a hidden test hook. J-01 is a journey a
 * person performs, and a device pass that seeds a token behind the UI would
 * prove the token store works while proving nothing about signing in.
 */
export interface SignInScreenProps {
  token: string;
  submitting: boolean;
  error?: string | null;
  onTokenChange: (next: string) => void;
  onSubmit: () => void;
}

export function SignInScreen({ token, submitting, error, onTokenChange, onSubmit }: SignInScreenProps) {
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
      {/*
        TOP-ALIGNED, and NOT centred — measured, not assumed.
        
        The first version of this screen used `flexGrow: 1, justifyContent:
        'center'`, which looks right on a tall phone and puts the submit button
        at y=365..409 once the soft keyboard takes 250 points of a 640pt screen.
        Nineteen points below the fold, on a screen that deliberately does not
        scroll (run 36) — so Maestro cannot tap it, and neither can a person.
        Run 39 spent nineteen minutes signed out for that reason: `GET
        /v1/feed/home` 401 once a minute for the whole run, and not one
        `GET /v1/me` from the device.
        
        `signin-fit.spec.ts` measures this at the keyboard-up viewport now.
      */}
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

        <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
          This build talks to a local API. Paste a token to continue.
        </Text>

        <Field
          testID="sign-in-token"
          accessibilityLabel="Access token"
          value={token}
          onChangeText={onTokenChange}
          placeholder="Access token"
          multiline
          // 64, not 96. A token is one long string; the extra 32 points bought
          // nothing and spent the button's headroom.
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />

        {error ? (
          <Banner testID="sign-in-error" tone="danger">
            {error}
          </Banner>
        ) : null}

        <Button
          testID="sign-in-submit"
          label={submitting ? 'Signing in…' : 'Get started'}
          disabled={submitting || token.trim().length === 0}
          onPress={onSubmit}
        />

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
