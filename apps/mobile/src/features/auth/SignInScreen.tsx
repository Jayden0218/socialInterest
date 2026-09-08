import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';

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
    <Screen testID="sign-in-screen" scroll>
      <View style={{ gap: space.lg }}>
        <Text style={{ ...textStyle.display, fontWeight: '700', color: palette.text.primary }}>Sign in</Text>

        <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
          This build talks to a local API, which issues its own tokens. Paste one to continue.
        </Text>

        <TextInput
          testID="sign-in-token"
          value={token}
          onChangeText={onTokenChange}
          placeholder="Access token"
          placeholderTextColor={palette.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{
            borderWidth: 1,
            borderColor: palette.line.hairline,
            borderRadius: radius.md,
            padding: space.md,
            color: palette.text.primary,
            minHeight: 96,
          }}
        />

        {error ? (
          <Banner testID="sign-in-error" tone="danger">
            {error}
          </Banner>
        ) : null}

        <Button
          testID="sign-in-submit"
          label={submitting ? 'Signing in…' : 'Sign in'}
          disabled={submitting || token.trim().length === 0}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}

/** Signed-out state for a surface that needs an identity. */
export function SignedOutNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Screen testID="signed-out" scroll>
      <View style={{ gap: space.md }}>
        <Text style={{ color: palette.text.primary }}>Sign in to do this.</Text>
        <Button testID="signed-out-sign-in" label="Sign in" onPress={onSignIn} />
      </View>
    </Screen>
  );
}
