/** The API the journeys drive. Set by global setup; never defaulted silently. */
export function baseUrl(): string {
  const url = process.env['E2E_BASE_URL'];
  if (!url) throw new Error('E2E_BASE_URL is not set - global setup did not run');
  return url;
}
