/**
 * Where the API lives.
 *
 * A device cannot reach an API running in a cloud sandbox - there is no inbound
 * route - so this points at a stack on the developer's own machine by default.
 * See docs/verification/tier-b-runbook.md.
 */
export const API_BASE_URL = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000/v1';
