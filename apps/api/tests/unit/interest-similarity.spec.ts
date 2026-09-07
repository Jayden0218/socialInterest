import { normaliseName, similarity } from '../../src/modules/interests/catalogue.cache';
import { InterestSearch } from '../../src/modules/interests/catalogue.search';

/**
 * FR-023 near-duplicate matching. This logic decides whether someone joins an
 * existing interest or fragments the catalogue with a near-copy, and SC-008
 * (<10% of new sub-interests later merged away) is the measure of whether it
 * works - so it gets a unit test rather than only integration coverage.
 */
describe('normaliseName', () => {
  it('collapses case, punctuation and whitespace', () => {
    expect(normaliseName('Film Photography')).toBe('film photography');
    expect(normaliseName('film-photography')).toBe('film photography');
    expect(normaliseName('  Film   Photography!  ')).toBe('film photography');
    expect(normaliseName('Film/Photography')).toBe('film photography');
  });

  it('makes the variants people actually type collide', () => {
    const forms = ['Film Photography', 'film-photography', 'FILM PHOTOGRAPHY', 'Film  Photography'];
    expect(new Set(forms.map(normaliseName)).size).toBe(1);
  });
});

describe('similarity', () => {
  it('is 1 for identical strings and 0 against empty', () => {
    expect(similarity('bouldering', 'bouldering')).toBe(1);
    expect(similarity('bouldering', '')).toBe(0);
  });

  it('scores single-character typos at or above the blocking threshold', () => {
    // The case the check exists for: "boldering" must not create a second
    // interest alongside "bouldering". Asserted against the real threshold so a
    // change to either the metric or the threshold fails here.
    const BLOCKING = InterestSearch.BLOCKING_SIMILARITY;
    expect(similarity('bouldering', 'boldering')).toBeGreaterThanOrEqual(BLOCKING);
    expect(similarity('sourdough', 'sourdaugh')).toBeGreaterThanOrEqual(BLOCKING);
    expect(similarity('portrait', 'portraits')).toBeGreaterThanOrEqual(BLOCKING);
  });

  it('scores genuinely different interests well below the threshold', () => {
    // Equally important: these must NOT be treated as duplicates, or the check
    // blocks legitimate interests and people stop creating them at all.
    const BLOCKING = InterestSearch.BLOCKING_SIMILARITY;
    expect(similarity('bouldering', 'birdwatching')).toBeLessThan(BLOCKING);
    expect(similarity('film photography', 'street photography')).toBeLessThan(BLOCKING);
    expect(similarity('cooking', 'climbing')).toBeLessThan(BLOCKING);
  });

  it('is symmetric', () => {
    expect(similarity('portraits', 'portrait')).toBeCloseTo(similarity('portrait', 'portraits'), 10);
  });

  it('leaves a clear margin between blocked and allowed', () => {
    // If these ever converge, the threshold is doing nothing useful.
    const typo = similarity('sourdough', 'sourdaugh');
    const distinct = similarity('film photography', 'street photography');
    expect(typo - distinct).toBeGreaterThan(0.15);
  });
});
