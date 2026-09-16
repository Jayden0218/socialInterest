import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO SURFACE THAT FETCHES MAY RENDER A BLANK SCREEN — 012/FR-001, FR-002,
 * SC-001.
 *
 * Before this feature, four of the five primary surfaces — Feed, Explore,
 * Activity, Chats — rendered NOTHING while their data loaded. "Still loading",
 * "there is nothing" and "that failed" were one blank rectangle, and the Feed
 * is the first screen a signed-in person sees.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A RENDER TEST. Rendering each container in
 * each of four states means stubbing the data layer four ways per screen, and a
 * stub is exactly where 007's `ApiPage<T>` defect hid: every mobile test stubbed
 * the data layer, the stubs were wrong in the same way the type was, so they
 * agreed with each other and neither agreed with the server. What is checked
 * here is STRUCTURAL — that a fetching surface routes through the one place the
 * four states are decided — and the behaviour is asserted in the browser, where
 * something can actually be seen.
 *
 * The structural claim is the honest one anyway: a screen consulting
 * `surfaceFallback` cannot render blank for a state it forgot, because it does
 * not enumerate the states at all.
 */
const SCREENS = join(__dirname, '..', 'screens');

/**
 * The five primary surfaces, under the names the CODE uses.
 *
 * The spec and the artboards say Feed, Explore, Activity, Chats and Profile;
 * the containers are `HomeFeed`, `Discover`, `Notifications`, `Inbox` and
 * `Profile`. That mismatch is why 004 recorded "grep for the identifier the
 * code would use, not the one the requirement is worded with" — a whole
 * requirement was reported unimplemented over `notificationPrefs` versus
 * `notificationPreferences`, and 012's own research repeated the mistake.
 */
const PRIMARY = [
  'HomeFeedContainer.tsx',
  'DiscoverContainer.tsx',
  'NotificationsContainer.tsx',
  'InboxContainer.tsx',
  'ProfileContainer.tsx',
];

describe('every primary surface distinguishes the four states (FR-001, SC-001)', () => {
  it('routes through the one place the states are decided', () => {
    const offenders: string[] = [];

    for (const name of PRIMARY) {
      const src = readFileSync(join(SCREENS, name), 'utf8')
        // Comments blanked: a file merely MENTIONING surfaceFallback in prose
        // has not called it, and "a guard that reads prose describes the
        // intention, not the build" is written into four other guards here.
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      if (!/surfaceFallback\s*\(/.test(src)) {
        offenders.push(`${name} decides its own states, or has none`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * THE OLD SHAPE, BANNED. `items.length === 0 ? <EmptyState/> : <List/>`
   * cannot tell empty from failed from still-loading, so it says "nothing here
   * yet" for a dropped connection — a lie that makes a person stop looking.
   * `InboxScreen` and `NotificationsScreen` both had exactly this.
   */
  it('no container decides "empty" from a bare length check', () => {
    const offenders: string[] = [];

    for (const name of readdirSync(SCREENS).filter((f) => f.endsWith('Container.tsx'))) {
      const src = readFileSync(join(SCREENS, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      if (/\.items\.length === 0\s*\?/.test(src) || /\.length === 0\s*\?\s*</.test(src)) {
        offenders.push(`${name} renders an empty state from a length check`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
