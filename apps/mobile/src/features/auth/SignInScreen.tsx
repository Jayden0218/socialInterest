import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { theme } from '../../ui/theme';
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
    <Screen testID="sign-in-screen">
      <View style={{ gap: theme.space.lg }}>
        <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>Sign in</Text>

        <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          This build talks to a local API, which issues its own tokens. Paste one to continue.
        </Text>

        <TextInput
          testID="sign-in-token"
          value={token}
          onChangeText={onTokenChange}
          placeholder="Access token"
          placeholderTextColor={theme.color.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{
            borderWidth: 1,
            borderColor: theme.color.border,
            borderRadius: theme.radius.md,
            padding: theme.space.md,
            color: theme.color.text,
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
    <Screen testID="signed-out">
      <View style={{ gap: theme.space.md }}>
        <Text style={{ color: theme.color.text }}>Sign in to do this.</Text>
        <Button testID="signed-out-sign-in" label="Sign in" onPress={onSignIn} />
      </View>
    </Screen>
  );
}
