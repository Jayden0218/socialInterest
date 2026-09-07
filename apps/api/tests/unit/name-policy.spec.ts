import { NamePolicy } from '../../src/modules/interests/name-policy';

/**
 * FR-031. Added to close finding G1 from /speckit-analyze: reporting existed,
 * but nothing screened a sub-interest name at creation.
 */
describe('NamePolicy', () => {
  const policy = new NamePolicy();

  it('allows ordinary interest names', () => {
    for (const name of ['Film Photography', 'Bouldering', 'Sourdough', 'Trail running', 'C++']) {
      expect(policy.evaluate(name).allowed).toBe(true);
    }
  });

  it('rejects names implying an official status', () => {
    expect(policy.evaluate('Official Photography').reason).toBe('impersonation');
    expect(policy.evaluate('admin').reason).toBe('impersonation');
  });

  it('does not reject a word that merely contains an impersonation term', () => {
    // Word-boundary matching, not substring: "Staffordshire" is a real place.
    expect(policy.evaluate('Staffordshire walks').allowed).toBe(true);
    expect(policy.evaluate('Officiating').allowed).toBe(true);
  });

  it('rejects invisible and direction-changing characters', () => {
    // These smuggle a name past both this screen and the duplicate check:
    // two names that render identically but normalise differently.
    expect(policy.evaluate('Cook​ing').reason).toBe('malformed');
    expect(policy.evaluate('Cook‮ing').reason).toBe('malformed');
    expect(policy.evaluate('Cook­ing').reason).toBe('malformed');
  });

  it('rejects names that are too short, too long, or have no letters', () => {
    expect(policy.evaluate('a').reason).toBe('malformed');
    expect(policy.evaluate('x'.repeat(51)).reason).toBe('malformed');
    expect(policy.evaluate('!!!').reason).toBe('malformed');
  });

  it('assertAllowed throws a 422 problem for a violation', () => {
    expect(() => policy.assertAllowed('official')).toThrow();
    expect(() => policy.assertAllowed('Bouldering')).not.toThrow();
  });
});
