import {
  keys,
  SK_PREFIX,
  ITEM_TYPE_004,
  ITEM_TYPE_005,
  OVERLAY_KEY_PREFIX,
  OVERLAY_ITEM_TYPE_PREFIX,
  overlayKey,
  overlayKeyPrefix,
  overlayItemType,
} from '../../src/persistence/keys';

/**
 * ===========================================================================
 * UPSTREAM MAY NOT ALLOCATE THE OVERLAY NAMESPACE.
 * ===========================================================================
 *
 * The reservation only means anything if it is enforced against FUTURE upstream
 * keys, not just today's. So this does not check a list of prefixes somebody
 * wrote down - it calls EVERY builder exported from `keys` and inspects what
 * comes out. A key added next year is covered without anybody remembering this
 * file exists.
 *
 * That shape is deliberate and this repository has the scar for it:
 * `auth-surface.spec.ts` was first written as a hand-picked list of routes, did
 * not contain the one route the second occurrence of the bug touched, and so
 * missed it. A hand-picked list only ever covers the mistakes you have already
 * made.
 *
 * WHAT THIS PREVENTS, precisely: a fork keying a row `WIDGET#1` under a person's
 * partition, upstream later adding its own `WIDGET#1` there, and a prefix Query
 * returning both - each row then deserialised as whatever its reader expected.
 * The two changes are in different files and merge cleanly, and each side's
 * tests pass against its own data, so nothing catches it until a reader gets a
 * row of the wrong shape in production.
 */

type Builder = (...args: unknown[]) => Record<string, string>;

/**
 * Call a builder with as many placeholder arguments as it declares.
 *
 * `fn.length` is the arity, and every builder here takes plain scalars, so
 * strings work for all of them - `mediaItem`'s ordinal reaches
 * `String(x).padStart(3, '0')`, which is happy with one.
 */
function callWithPlaceholders(name: string, fn: Builder): Record<string, string> {
  const args = Array.from({ length: fn.length }, (_, i) => `arg${i}`);
  return fn(...args);
}

const builders = Object.entries(keys) as [string, Builder][];

describe('the overlay key namespace is reserved', () => {
  it('every builder in `keys` is callable, so the sweep below covers all of them', () => {
    // Guards the guard: if a builder ever needed something a placeholder string
    // cannot supply, it would throw here rather than silently drop out of the
    // sweep and leave its keys unchecked.
    expect(builders.length).toBeGreaterThan(0);
    for (const [name, fn] of builders) {
      expect(() => callWithPlaceholders(name, fn)).not.toThrow();
    }
  });

  it('no key any builder emits begins with the reserved prefix', () => {
    const offenders: string[] = [];
    for (const [name, fn] of builders) {
      for (const [field, value] of Object.entries(callWithPlaceholders(name, fn))) {
        if (typeof value === 'string' && value.startsWith(OVERLAY_KEY_PREFIX)) {
          offenders.push(`keys.${name}().${field} = ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no SK_PREFIX value begins with the reserved prefix', () => {
    const offenders = Object.entries(SK_PREFIX)
      .filter(([, v]) => v.startsWith(OVERLAY_KEY_PREFIX))
      .map(([k, v]) => `SK_PREFIX.${k} = ${v}`);
    expect(offenders).toEqual([]);
  });

  it('no item-type discriminator begins with the reserved type prefix', () => {
    const offenders = [
      ...Object.entries(ITEM_TYPE_004),
      ...Object.entries(ITEM_TYPE_005),
    ]
      .filter(([, v]) => v.startsWith(OVERLAY_ITEM_TYPE_PREFIX))
      .map(([k, v]) => `${k} = ${v}`);
    expect(offenders).toEqual([]);
  });
});

describe('overlayKey', () => {
  it('produces a key inside the reserved namespace', () => {
    expect(overlayKey('WIDGET', 'abc')).toBe('X#WIDGET#abc');
    expect(overlayKey('WIDGET', 'abc').startsWith(OVERLAY_KEY_PREFIX)).toBe(true);
  });

  it('produces a Query prefix inside the reserved namespace', () => {
    expect(overlayKeyPrefix('WIDGET')).toBe('X#WIDGET#');
    expect(overlayKeyPrefix('WIDGET').startsWith(OVERLAY_KEY_PREFIX)).toBe(true);
  });

  it('is built from OVERLAY_KEY_PREFIX, so the helper cannot drift out of the reservation', () => {
    // The two assertions above would both still pass against a helper that
    // hard-coded 'X#' while the constant said something else - and the sweep
    // checks keys against the CONSTANT, so the fork's rows would then sit
    // outside the space upstream is avoiding.
    expect(overlayKey('WIDGET')).toBe(`${OVERLAY_KEY_PREFIX}WIDGET`);
  });

  /**
   * THE POINT OF THE WHOLE NAMESPACE, asserted directly: an overlay entity that
   * picks the same obvious name as a base one still cannot collide with it.
   */
  it('cannot collide with a base key that picked the same name', () => {
    expect(overlayKey('POST', '1')).not.toBe(keys.post('1').pk);
    expect(overlayKey('POST', '1').startsWith('POST#')).toBe(false);
    expect(overlayKeyPrefix('COLLECTION')).not.toBe(SK_PREFIX.collection);
  });

  it('refuses a namespace containing a separator, which would add a segment', () => {
    expect(() => overlayKey('WID#GET')).toThrow(/uppercase alphanumeric/);
  });

  it('refuses an empty or lowercase namespace', () => {
    expect(() => overlayKey('')).toThrow(/uppercase alphanumeric/);
    expect(() => overlayKey('widget')).toThrow(/uppercase alphanumeric/);
  });
});

describe('overlayItemType', () => {
  it('produces a discriminator inside the reserved type namespace', () => {
    expect(overlayItemType('widget')).toBe('x-widget');
    expect(overlayItemType('widget').startsWith(OVERLAY_ITEM_TYPE_PREFIX)).toBe(true);
  });

  it('cannot collide with a base discriminator that picked the same name', () => {
    expect(overlayItemType('place')).not.toBe(ITEM_TYPE_004.place);
    expect(overlayItemType('rating')).not.toBe(ITEM_TYPE_005.rating);
  });

  it('refuses anything but lowercase kebab-case', () => {
    expect(() => overlayItemType('Widget')).toThrow(/lowercase kebab-case/);
    expect(() => overlayItemType('')).toThrow(/lowercase kebab-case/);
  });
});
