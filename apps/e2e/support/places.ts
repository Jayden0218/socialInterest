/**
 * The fixture set SC-007 is measured against.
 *
 * SC-007: "creating a place whose name closely matches an existing place in the
 * same locality surfaces that existing place BEFORE the create action in every
 * case in the fixture set." A criterion phrased "in every case in the fixture
 * set" is only as honest as the set, so this one is built to contain the cases
 * that a naive exact-match dedupe gets wrong.
 *
 * Nothing here talks to the API. It is data, imported by whatever drives it.
 */

export interface PlaceSeed {
  name: string;
  category: 'restaurant' | 'cafe' | 'bar' | 'shop' | 'venue' | 'outdoor' | 'other';
  locality: string;
}

/** Seeded first. These are the places that already exist. */
export const EXISTING_PLACES: PlaceSeed[] = [
  { name: "Joe's Diner", category: 'restaurant', locality: 'Singapore' },
  { name: 'Tiong Bahru Bakery', category: 'cafe', locality: 'Singapore' },
  { name: 'The Coconut Club', category: 'restaurant', locality: 'Singapore' },
  { name: 'Hawker Chan', category: 'restaurant', locality: 'Singapore' },
  { name: 'Blue Bottle Coffee', category: 'cafe', locality: 'Tokyo' },
];

/**
 * Each of these MUST surface `expectExisting` above the create action.
 *
 * `why` is not decoration - it is the thing that fails informatively when the
 * dedupe regresses, because "case 4 failed" tells you nothing and "punctuation
 * is not significant" tells you where to look.
 */
export const MUST_DEDUPE: { typed: string; locality: string; expectExisting: string; why: string }[] = [
  { typed: "Joe's Diner", locality: 'Singapore', expectExisting: "Joe's Diner", why: 'exact match' },
  { typed: "joe's diner", locality: 'Singapore', expectExisting: "Joe's Diner", why: 'case is not significant' },
  { typed: 'Joes Diner', locality: 'Singapore', expectExisting: "Joe's Diner", why: 'punctuation is not significant' },
  { typed: "  Joe's   Diner  ", locality: 'Singapore', expectExisting: "Joe's Diner", why: 'whitespace is not significant' },
  { typed: 'Joe’s Diner', locality: 'Singapore', expectExisting: "Joe's Diner", why: 'a typographic apostrophe is the one a phone keyboard produces' },
  { typed: 'The Coconut Club', locality: 'Singapore', expectExisting: 'The Coconut Club', why: 'a leading article is part of the name here' },
  { typed: 'Coconut Club', locality: 'Singapore', expectExisting: 'The Coconut Club', why: 'and is not significant when typed without it' },
  { typed: 'tiong bahru bakery', locality: 'Singapore', expectExisting: 'Tiong Bahru Bakery', why: 'multi-word, case-folded' },
];

/**
 * These MUST NOT dedupe. A dedupe that is too eager is worse than none: it
 * silently files a post to the wrong restaurant, and nobody can tell.
 */
export const MUST_NOT_DEDUPE: { typed: string; locality: string; why: string }[] = [
  {
    typed: "Joe's Diner",
    locality: 'Tokyo',
    why: 'SAME NAME, DIFFERENT CITY. Uniqueness is per locality (FR-014) - two "Joe\'s" in different cities are two restaurants, and this is the case a global slug index gets wrong',
  },
  { typed: "Joe's Grill", locality: 'Singapore', why: 'a shared first word is not a match' },
  { typed: 'Hawker Chun', locality: 'Singapore', why: 'one letter apart, and genuinely a different place' },
  { typed: 'Bakery', locality: 'Singapore', why: 'a substring of an existing name is not that place' },
];

/** Total assertions SC-007 reports against. */
export const SC007_CASE_COUNT = MUST_DEDUPE.length + MUST_NOT_DEDUPE.length;
