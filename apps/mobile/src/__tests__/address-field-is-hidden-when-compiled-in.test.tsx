/**
 * A BUILD THAT KNOWS WHERE ITS SERVER IS DOES NOT OPEN BY ASKING.
 *
 * The address is compiled in at build time (`EXPO_PUBLIC_API_BASE_URL`), and
 * once it is, showing a field for it makes the first screen of a social app look
 * like a client configuration dialog. The field is HIDDEN, not removed — the
 * address is a default rather than a pin (009/US1), and the case that decides it
 * is mundane: a laptop whose DHCP lease moves leaves an APK that can reach
 * nothing, and a product that cannot be repaired from inside itself is worse
 * than one that asks a question.
 *
 * Both halves are asserted, because only having the first is how a control ends
 * up existing with nothing behind it — a "Following" tab with no feed, a
 * `readAt` nothing writes, a follow button wired to `() => undefined`.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { SignInScreen } from '../features/auth/SignInScreen';

/**
 * 011 replaced the token field with an email address and a password. Nothing
 * about the ADDRESS changed — it is still a compiled-in default, still hidden
 * behind a quiet control, still repairable from inside the app — so this file's
 * subject is unchanged and only the props it hands over moved.
 */
const props = {
  email: '',
  password: '',
  submitting: false,
  onEmailChange: () => undefined,
  onPasswordChange: () => undefined,
  onSubmit: () => undefined,
  onCreateAccount: () => undefined,
  address: 'http://192.168.1.42:3000/v1',
  onAddressChange: () => undefined,
};

describe('the address field when a backend was compiled in', () => {
  it('is not shown', () => {
    const { queryByTestId } = render(<SignInScreen {...props} addressFixed />);
    expect(queryByTestId('sign-in-address')).toBeNull();
  });

  it('can still be reached, because a moved address must be repairable', () => {
    const { queryByTestId, getByTestId } = render(<SignInScreen {...props} addressFixed />);
    fireEvent.press(getByTestId('sign-in-change-server'));
    expect(queryByTestId('sign-in-address')).not.toBeNull();
  });

  it('is shown from the start when nothing was compiled in', () => {
    // The developer build, and every session-server build: there is no sensible
    // default, so asking is the only honest thing the screen can do.
    const { queryByTestId } = render(<SignInScreen {...props} />);
    expect(queryByTestId('sign-in-address')).not.toBeNull();
    expect(queryByTestId('sign-in-change-server')).toBeNull();
  });

  it('still submits without the field visible', () => {
    // The submit must not depend on a control nobody can see. `addressReady`
    // reads the ADDRESS, not the field — and a check written against the field
    // would disable the button on exactly the builds this exists for.
    let submitted = false;
    const { getByTestId } = render(
      <SignInScreen
        {...props}
        email="jo@example.com"
        password="a-long-enough-password"
        onSubmit={() => (submitted = true)}
        addressFixed
      />,
    );
    fireEvent.press(getByTestId('sign-in-submit'));
    expect(submitted).toBe(true);
  });
});
