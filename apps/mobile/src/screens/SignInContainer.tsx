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
import { PASSWORD_FLOOR_MESSAGE } from '@sih/shared';
import { SignInScreen } from '../features/auth/SignInScreen';
import { SignUpScreen } from '../features/auth/SignUpScreen';

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
export function describeFailure(e: unknown, address: string | undefined): string {
  const unreachable = address
    ? `Could not reach ${address}. Check the server address — and that the session is still running.`
    : 'Could not reach the server. Check that it is running.';

  /**
   * STATUS 0 IS THE SIGNAL, not the wording.
   *
   * The first version of this function tested `e instanceof DataError` FIRST and
   * returned `e.message`, with the network branch below it. That branch was
   * unreachable for the only case it was written for: `toDataError` wraps a
   * failed fetch as `DataError(0, { detail: 'Network request failed' })`, so the
   * DataError check matched first and the friendly message was dead code. The
   * app showed React Native's raw string on the first real device launch.
   *
   * Fixed by reading the STRUCTURED signal the data layer already provides —
   * status 0 means no HTTP response happened at all — rather than by matching
   * prose. `errors.ts` says so in its own comment: "Offline, DNS failure, TLS —
   * no HTTP status exists". Matching on message text would also break the moment
   * a platform reworded it, which is how a guard ends up describing an intention
   * instead of a build.
   */
  if (e instanceof DataError) return e.status === 0 ? unreachable : e.message;

  // A throw that never reached the data layer at all. The pattern stays as a
  // backstop, but nothing routine depends on it any more.
  const raw = e instanceof Error ? e.message : String(e);
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(raw)) return unreachable;
  return raw;
}

/**
 * THE FIELD ERRORS THE SERVER REPORTS, pulled out of the problem document.
 *
 * `DomainError` carries `errors: [{ field, message }]` (FR-007), and this is
 * the only place that shape is read. Returning `{}` for anything else means a
 * refusal with no field named still shows its message in the banner rather than
 * vanishing — a refusal nobody can see is worse than a rude one.
 */
function fieldErrorsOf(e: unknown): Record<string, string> {
  if (!(e instanceof DataError)) return {};
  const body = (e as unknown as { body?: { errors?: { field: string; message: string }[] } }).body;
  const errors = body?.errors;
  if (!Array.isArray(errors)) return {};
  return Object.fromEntries(errors.map((x) => [x.field, x.message]));
}

/**
 * ONE CONTAINER FOR BOTH SCREENS, AND THAT IS FR-028 RATHER THAN LAZINESS.
 *
 * 011's task list called for a separate `SignUpContainer`. Written that way,
 * each container owns its own `email` state — and FR-028 says a person moving
 * between signing in and creating an account must not lose what they typed in
 * the field common to both. Two owners of one value is exactly how it gets
 * lost: the switch unmounts one and mounts the other with an empty string.
 *
 * The alternative was lifting `email` into `App.tsx`, which would put a
 * half-typed address in the root of the application to serve two screens below
 * it. So the state lives where both screens are chosen, which is here, and
 * there is no second container. Recorded rather than done quietly, because a
 * deviation nobody writes down reads as an oversight later.
 *
 * The name stays `SignInContainer` because `App.tsx` and the screens barrel
 * both name it, and renaming a file to describe a widened job is a diff across
 * the app for no behaviour.
 */
export function SignInContainer({
  onSignedIn,
  address,
  onAddressChange,
  addressFixed,
}: {
  onSignedIn: () => void;
  address?: string;
  onAddressChange?: (next: string) => Promise<void> | void;
  /** 010. True when the build already knows its backend — see `config.ts`. */
  addressFixed?: boolean;
}) {
  const data = useData();

  /**
   * Every hook above every return, per `hooks-before-return.test.ts`. A hook
   * after an early return is "Rendered more hooks than during the previous
   * render"; after the final one it is dead code that looks like a feature —
   * which is how 003's save button came to do nothing.
   */
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [draftAddress, setDraftAddress] = useState(address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The stored address arrives asynchronously, so the draft follows it until the
  // person edits it. Seeding state once from a prop that is still loading is how
  // a field ends up permanently showing the built-in default.
  useEffect(() => {
    if (address !== undefined) setDraftAddress(address);
  }, [address]);

  /**
   * THE ADDRESS IS APPLIED BEFORE THE CREDENTIAL, and the order is not cosmetic.
   *
   * Applying it clears any credential held for the previous backend
   * (`contracts/backend-address.md` §3), so signing in first would store one and
   * then immediately discard it. Applying it first also means the `GET /v1/me`
   * that follows is issued against the backend the person just named — which
   * works only because `baseUrl` is resolved per request rather than captured
   * when the data layer was built.
   */
  const run = useCallback(
    async (act: () => Promise<unknown>) => {
      setSubmitting(true);
      setError(null);
      setFieldErrors({});
      try {
        if (onAddressChange) await onAddressChange(draftAddress.trim());
        await act();
        onSignedIn();
      } catch (e: unknown) {
        // Both acts end by calling GET /v1/me with the new credential, so a
        // rejected one fails here rather than being stored and failing on every
        // later screen. An unreachable address fails here too, and says which.
        setError(describeFailure(e, onAddressChange ? draftAddress.trim() : undefined));
        setFieldErrors(fieldErrorsOf(e));
      } finally {
        setSubmitting(false);
      }
    },
    [draftAddress, onAddressChange, onSignedIn],
  );

  const submitSignIn = useCallback(
    () => run(() => data.session.signInWithPassword(email.trim(), password)),
    [run, data, email, password],
  );

  const submitSignUp = useCallback(
    () =>
      run(() =>
        data.session.signUp({
          email: email.trim(),
          password,
          handle: handle.trim().toLowerCase(),
          displayName: displayName.trim(),
        }),
      ),
    [run, data, email, password, handle, displayName],
  );

  /**
   * SWITCHING CLEARS THE REFUSAL, NOT THE FORM.
   *
   * The email survives, which is the requirement. The error does not: a message
   * about the sign-in that just failed, left sitting above a sign-up form, is
   * the app answering a question nobody asked.
   */
  const switchTo = useCallback((next: 'sign-in' | 'sign-up') => {
    setMode(next);
    setError(null);
    setFieldErrors({});
  }, []);

  const addressProps = onAddressChange
    ? { address: draftAddress, onAddressChange: setDraftAddress }
    : {};

  if (mode === 'sign-up') {
    return (
      <SignUpScreen
        email={email}
        password={password}
        handle={handle}
        displayName={displayName}
        passwordHint={PASSWORD_FLOOR_MESSAGE}
        submitting={submitting}
        error={error}
        fieldErrors={fieldErrors}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onHandleChange={setHandle}
        onDisplayNameChange={setDisplayName}
        onSubmit={() => void submitSignUp()}
        onSignIn={() => switchTo('sign-in')}
      />
    );
  }

  return (
    <SignInScreen
      email={email}
      password={password}
      submitting={submitting}
      error={error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => void submitSignIn()}
      onCreateAccount={() => switchTo('sign-up')}
      {...addressProps}
      {...(addressFixed === undefined ? {} : { addressFixed })}
    />
  );
}
