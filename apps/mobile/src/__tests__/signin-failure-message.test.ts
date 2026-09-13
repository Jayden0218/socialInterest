import { describeFailure } from '../screens/SignInContainer';
import { DataError } from '../data';

/**
 * 009/FR-004 and `contracts/backend-address.md` §4: a backend that cannot be
 * reached must SAY SO, and must not be presented as an absence of content.
 *
 * THIS TEST EXISTS BECAUSE THE MESSAGE WAS UNREACHABLE ON THE FIRST DEVICE
 * LAUNCH. `describeFailure` checked `instanceof DataError` before the network
 * branch, and `toDataError` wraps a failed fetch as
 * `DataError(0, { detail: 'Network request failed' })` — so the DataError check
 * always matched first and the friendly text was dead code for the only case it
 * was written for. The app showed React Native's raw string instead.
 *
 * A declared half with no other half, in miniature, written by the same hand
 * that had just written a spec about them. Found by running it on a phone —
 * which is the point of running it on a phone.
 */
describe('what the sign-in screen says when it cannot reach the backend', () => {
  const address = 'https://example.trycloudflare.com/v1';

  it('names the address when the data layer reports no HTTP response (status 0)', () => {
    const wrapped = new DataError(0, { title: 'Network unavailable', detail: 'Network request failed' });
    const msg = describeFailure(wrapped, address);
    expect(msg).toContain(address);
    expect(msg).not.toBe('Network request failed');
  });

  it('does NOT swallow a real HTTP failure into the unreachable message', () => {
    // A rejected credential is a different problem with a different fix, and
    // telling someone to check the address would send them the wrong way.
    const rejected = new DataError(401, { title: 'Unauthorized', detail: 'No such person' });
    expect(describeFailure(rejected, address)).toBe('No such person');
  });

  it('still handles a raw throw that never reached the data layer', () => {
    expect(describeFailure(new TypeError('Network request failed'), address)).toContain(address);
  });

  it('says something useful when no address is configurable', () => {
    const wrapped = new DataError(0, { title: 'Network unavailable', detail: 'Network request failed' });
    expect(describeFailure(wrapped, undefined)).toMatch(/could not reach the server/i);
  });
});
