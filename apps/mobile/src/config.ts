/**
 * Where the API lives. Set EXPO_PUBLIC_API_BASE_URL at build time; Expo inlines
 * it, so it must be present when the bundle is built, not just at runtime.
 *
 * The default suits a simulator on the same host. A physical device needs a LAN
 * address, or a tunnel URL when it is not on your network - including a device in
 * a cloud device farm. See docs/verification/tier-b-runbook.md.
 */
export const API_BASE_URL = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000/v1';

/**
 * Whether this build was given a real backend at build time.
 *
 * Derived by COMPARING, not by testing the variable, because Expo inlines
 * `process.env.X` by textual substitution: after the build there is no variable
 * left to ask about, only the string it became. Comparing against the fallback
 * is the same question asked in a way that survives the substitution.
 *
 * What it decides: whether the sign-in screen shows an address field at all. A
 * build that already knows where its server is should not open by asking.
 */
export const ADDRESS_IS_COMPILED_IN = API_BASE_URL !== 'http://127.0.0.1:3000/v1';
