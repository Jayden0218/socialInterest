/**
 * SignInContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { SignInScreen } from '../features/auth/SignInScreen';

/**
 * 009/FR-004. A backend that cannot be reached must SAY SO.
 *
 * A network failure arrives as a TypeError from fetch, whose message is
 * "Network request failed" on a device and "Failed to fetch" in a browser.
 * Neither names the thing that went wrong, and both are indistinguishable to a
 * person from the app simply having nothing to show — which is the confusion
 * `contracts/backend-address.md` §4 forbids, and which this product has shipped
 * five times in the other direction by rendering candidate rows as empty posts.
 *
 * A wrong address is the single likeliest mistake here: it is typed by hand, on
 * a phone, from a string somebody read off another screen.
 */
function describeFailure(e: unknown, address: string | undefined): string {
  if (e instanceof DataError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(raw)) {
    return address
      ? `Could not reach ${address}. Check the server address — and that the session is still running.`
      : 'Could not reach the server. Check that it is running.';
  }
  return raw;
}

export function SignInContainer({
  onSignedIn,
  address,
  onAddressChange,
}: {
  onSignedIn: () => void;
  address?: string;
  onAddressChange?: (next: string) => Promise<void> | void;
}) {
  const data = useData();
  const [token, setToken] = useState('');
  const [draftAddress, setDraftAddress] = useState(address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The stored address arrives asynchronously, so the draft follows it until the
  // person edits it. Seeding state once from a prop that is still loading is how
  // a field ends up permanently showing the built-in default.
  useEffect(() => {
    if (address !== undefined) setDraftAddress(address);
  }, [address]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      /**
       * THE ADDRESS IS APPLIED BEFORE THE CREDENTIAL, and the order is not
       * cosmetic.
       *
       * Applying it clears any credential held for the previous backend
       * (`contracts/backend-address.md` §3), so signing in first would store a
       * token and then immediately discard it. Applying it first also means the
       * `GET /v1/me` below is issued against the backend the person just named —
       * which works only because `baseUrl` is resolved per request rather than
       * captured when the data layer was built.
       */
      if (onAddressChange) await onAddressChange(draftAddress.trim());
      await data.session.signIn(token.trim());
      onSignedIn();
    } catch (e: unknown) {
      // signIn calls GET /v1/me with the token, so a rejected token fails here
      // rather than being stored and failing on every later screen. An
      // unreachable address fails here too, and says which address.
      setError(describeFailure(e, onAddressChange ? draftAddress.trim() : undefined));
    } finally {
      setSubmitting(false);
    }
  }, [data, token, draftAddress, onAddressChange, onSignedIn]);

  return (
    <SignInScreen
      token={token}
      submitting={submitting}
      error={error}
      onTokenChange={setToken}
      onSubmit={() => void submit()}
      {...(onAddressChange
        ? { address: draftAddress, onAddressChange: setDraftAddress }
        : {})}
    />
  );
}
