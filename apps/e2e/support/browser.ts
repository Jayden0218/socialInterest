import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/**
 * Launches Chromium, preferring one already on the machine.
 *
 * The sandbox ships a pinned build under PLAYWRIGHT_BROWSERS_PATH that will not
 * always match the playwright package's expected revision, and downloading a
 * second copy is both slow and blocked here. CI has no preinstalled build, so it
 * falls through to playwright's own resolution after `playwright install`.
 */
const CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
];

export async function launchChromium(): Promise<Browser> {
  const local = CANDIDATES.find((p) => existsSync(p));
  return chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(local ? { executablePath: local } : {}),
  });
}
