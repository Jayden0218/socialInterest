import { parseMentions, resolveMentions } from '../../src/modules/engagement/mention';

/**
 * 008/T128, US9 — FR-030, FR-033. RESOLVED AT WRITE TIME, NOT AT READ TIME.
 *
 * Research R9: re-parsing `@handle` when a caption is rendered means a handle
 * change silently re-points every old mention at whoever holds that handle now.
 * The person mentioned in 2026 is the person who was mentioned, permanently, so
 * the text is resolved once and the RESULT is stored.
 *
 * An unknown handle is not an error and not a mention: it stays plain text
 * (FR-033), because refusing a caption over an `@` somebody typed casually
 * would be a product deciding it knows better.
 */
describe('008/US9 mention resolution', () => {
  const directory = new Map([
    ['ada', 'U-ADA'],
    ['jo', 'U-JO'],
  ]);
  const lookup = async (handle: string): Promise<string | null> => directory.get(handle) ?? null;

  it('finds handles anywhere in the text, case-insensitively', async () => {
    expect(parseMentions('morning @Ada — ask @jo too')).toEqual(['ada', 'jo']);
  });

  it('ignores an email address and a bare @', async () => {
    // `@` is punctuation as often as it is an address. A parser that treated
    // `ada@example.test` as a mention of `example` would notify a stranger.
    expect(parseMentions('write to ada@example.test or just @')).toEqual([]);
  });

  it('does not repeat a handle mentioned twice', async () => {
    expect(await resolveMentions('@ada and @ada again', lookup)).toEqual(['U-ADA']);
  });

  it('FR-033 an unknown handle yields NO mention rather than an error', async () => {
    expect(await resolveMentions('@ada and @nobodyhere', lookup)).toEqual(['U-ADA']);
  });

  it('resolves to USER IDS, so a later handle change cannot re-point it', async () => {
    expect(await resolveMentions('@jo', lookup)).toEqual(['U-JO']);
  });

  it('is bounded, so one caption cannot notify a crowd', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `@ada`).join(' ');
    expect((await resolveMentions(many, lookup)).length).toBeLessThanOrEqual(10);
  });
});
