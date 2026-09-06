import { normalisePlaceName, slugifyPlace, normaliseLocality } from '../../src/persistence/place.repository';
import { EXISTING_PLACES, MUST_DEDUPE, MUST_NOT_DEDUPE } from '../../../e2e/support/places';

/**
 * The normaliser IS the dedupe (004/FR-014, SC-007).
 *
 * Measured against the fixture set rather than examples invented here, so this
 * suite and the journey that measures SC-002 over HTTP cannot disagree about
 * what "closely matches" means.
 *
 * Both directions matter, and the second one more: a dedupe that is too eager
 * silently files a post to the wrong restaurant, and nobody can tell.
 */
describe('place name normalisation - SC-007', () => {
  const slugOf = (name: string, locality: string) => `${normaliseLocality(locality)}#${slugifyPlace(name)}`;
  const existing = new Map(EXISTING_PLACES.map((p) => [slugOf(p.name, p.locality), p.name]));

  describe('must dedupe', () => {
    for (const c of MUST_DEDUPE) {
      it(`"${c.typed}" -> "${c.expectExisting}" (${c.why})`, () => {
        expect(existing.get(slugOf(c.typed, c.locality))).toBe(c.expectExisting);
      });
    }
  });

  describe('must NOT dedupe', () => {
    for (const c of MUST_NOT_DEDUPE) {
      it(`"${c.typed}" in ${c.locality} is its own place (${c.why})`, () => {
        expect(existing.get(slugOf(c.typed, c.locality))).toBeUndefined();
      });
    }
  });

  it('normalisation is idempotent - normalising twice is normalising once', () => {
    for (const p of EXISTING_PLACES) {
      expect(normalisePlaceName(normalisePlaceName(p.name))).toBe(normalisePlaceName(p.name));
    }
  });
});
