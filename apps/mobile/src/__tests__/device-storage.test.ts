/**
 * 009, `contracts/backend-address.md` §2 — the device half of persistence.
 *
 * THIS FILE EXISTS BECAUSE OF WHERE ITS ASSERTION WAS FIRST WRITTEN.
 *
 * It began as one `describe` inside `settings-store.test.ts`, which imports a
 * module 009 had not written yet. So the whole suite failed to load, and the one
 * assertion in it that was red against the SHIPPED PRODUCT - for the product's
 * own reason - never ran at all. The evidence existed and could not be reached,
 * which is run 40 and run 56 in a third place.
 *
 * It lives alone now, importing only code that already exists, so it can fail
 * for its own reason and be seen doing it.
 *
 * WHAT IT IS ABOUT: `browserKeyValueStore()` is the only implementation of
 * `KeyValueStore`. It reads `globalThis.localStorage` and returns null anywhere
 * else, so on a device `defaultTokenStore()` returns undefined, the token store
 * falls back to memory, and the app signs out on every relaunch.
 * `data-provider.tsx` records that in its own comment as "a real remaining gap,
 * recorded rather than hidden". FR-002 cannot be met while it stands.
 */
import * as tokenStore from '../data/token-store';

describe('the data layer has a device backing store (FR-002)', () => {
  it('exports a device key/value store alongside the browser one', () => {
    expect(typeof tokenStore.browserKeyValueStore).toBe('function');
    expect(typeof tokenStore.deviceKeyValueStore).toBe('function');
  });

  it('the device store either works or reports itself absent, and never throws', () => {
    // Null is the honest answer where the native module is genuinely absent,
    // which is the case under the jest preset. What is asserted is that the SEAM
    // exists and answers safely - before 009 there was no seam at all.
    const store = tokenStore.deviceKeyValueStore();
    expect(store === null || typeof store.getItem === 'function').toBe(true);
  });
});
