/**
 * Where the API lives. Set EXPO_PUBLIC_API_BASE_URL at build time; Expo inlines
 * it, so it must be present when the bundle is built, not just at runtime.
 *
 * The default suits a simulator on the same host. A physical device needs a LAN
 * address, or a tunnel URL when it is not on your network - including a device in
 * a cloud device farm. See docs/verification/tier-b-runbook.md.
 */
export const API_BASE_URL = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000/v1';
