import {
  MAX_TERMS_PER_POST,
  MIN_TERM_LENGTH,
  STOP_WORDS,
  queryTerms,
  tokenise,
} from '../../src/modules/search/tokeniser';

/**
 * 008/T089, US6. The tokeniser, pinned.
 *
 * It is deliberately simple (research R6) and its limits are the interesting
 * part: what it CANNOT do is stated in the module and asserted here, so a later
 * reader does not mistake simplicity for an oversight.
 */
describe('008/US6 the tokeniser', () => {
  it('folds case, so a search need not match the writing', () => {
    expect(tokenise('Bouldering At Dawn')).toEqual(['bouldering', 'dawn']);
  });

  it('splits on punctuation and keeps letters and digits', () => {
    expect(tokenise('rock-climbing, v7! 2026')).toEqual(['rock', 'climbing', 'v7', '2026']);
  });

  it('handles non-Latin script, because names and captions are not all English', () => {
    // `\p{L}` rather than `[a-z]`: a caption in Japanese or Greek must produce
    // terms rather than nothing at all.
    expect(tokenise('κλίμακα 山登り')).toEqual(['κλίμακα', '山登り']);
  });

  it('drops stop words, which exist to keep a partition from collecting everything', () => {
    expect(tokenise('the best of the climbs')).toEqual(['best', 'climbs']);
    expect(STOP_WORDS.has('the')).toBe(true);
  });

  it(`drops tokens shorter than ${MIN_TERM_LENGTH}`, () => {
    expect(tokenise('a I go up')).toEqual(['go', 'up']);
  });

  it('deduplicates, so one word does not cost several rows', () => {
    expect(tokenise('climb climb CLIMB')).toEqual(['climb']);
  });

  it('caps at MAX_TERMS_PER_POST, keeping the FIRST words', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
    const terms = tokenise(words.join(' '));
    expect(terms).toHaveLength(MAX_TERMS_PER_POST);
    // First-appearance order: the words written first are likeliest to be what
    // the post is about, so truncating from the end loses the least.
    expect(terms[0]).toBe('word0');
    expect(terms[MAX_TERMS_PER_POST - 1]).toBe(`word${MAX_TERMS_PER_POST - 1}`);
  });

  it('is empty for null, undefined and whitespace, so a post with no caption writes no rows', () => {
    expect([tokenise(null), tokenise(undefined), tokenise('   '), tokenise('')]).toEqual([[], [], [], []]);
  });

  it('a QUERY is tokenised the same way as a caption', () => {
    /**
     * The load-bearing property. Two tokenisers would be two chances to
     * disagree, and the disagreement looks exactly like a post that exists and
     * cannot be found - which is the worst kind of search bug because nothing
     * errors.
     */
    const caption = 'Bouldering, at Dawn!';
    expect(queryTerms(caption)).toEqual(tokenise(caption));
    expect(queryTerms('THE BOULDERING')).toEqual(['bouldering']);
  });

  it('the cap is a TRANSACTION bound, not a preference', () => {
    // 005/R3: TransactWriteItems caps at 100 items, and term rows share the
    // publish transaction with the post, its media and its index items.
    // Changing this number without re-checking that ceiling is how a post
    // becomes silently un-publishable.
    expect(MAX_TERMS_PER_POST).toBe(40);
  });
});
