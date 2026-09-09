/**
 * 008/US9 — @handle, RESOLVED AT WRITE TIME (FR-030, research R9).
 *
 * The stored value is a list of USER IDS, not the text. Re-parsing a caption at
 * read time would mean a handle change silently re-points every old mention at
 * whoever holds that handle now: the person mentioned last year would quietly
 * become somebody else, on content they never appeared in. Resolution happens
 * once, and what is stored is the answer.
 *
 * An unknown handle is NOT an error and NOT a mention (FR-033). It stays plain
 * text, because refusing a caption over an `@` somebody typed casually is a
 * product deciding it knows better than the person writing.
 */

/**
 * At most ten per piece of text.
 *
 * A bound rather than a preference: each resolved mention is a notification, and
 * an unbounded list makes one caption a way to put a message in front of a
 * crowd. Ten is the same ceiling the product already puts on photographs in a
 * post, and it is stated here so a reader meets it as a rule rather than as a
 * surprise.
 */
export const MAX_MENTIONS = 10;

/**
 * A handle is `@` followed by handle characters, NOT PRECEDED BY one that would
 * make it part of a word.
 *
 * The lookbehind is what keeps `ada@example.test` from reading as a mention of
 * `example` — an email address is the commonest `@` in ordinary text, and
 * notifying a stranger because somebody wrote one would be indefensible.
 */
const MENTION = /(^|[^A-Za-z0-9_@.])@([a-z0-9_]{2,30})/gi;

/** The handles a piece of text names, lowercased and de-duplicated in order. */
export function parseMentions(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const handle = (match[2] ?? '').toLowerCase();
    if (handle && !out.includes(handle)) out.push(handle);
  }
  return out.slice(0, MAX_MENTIONS);
}

/**
 * The user ids a piece of text names.
 *
 * `lookup` is passed in rather than a repository injected, so the rule is
 * testable without a datastore and the service cannot express it differently
 * from its test — the same shape as `reply-parent.ts` and `tokeniser.ts`.
 */
export async function resolveMentions(
  text: string,
  lookup: (handle: string) => Promise<string | null>,
): Promise<string[]> {
  const handles = parseMentions(text);
  const ids: string[] = [];
  for (const handle of handles) {
    const userId = await lookup(handle);
    if (userId && !ids.includes(userId)) ids.push(userId);
  }
  return ids;
}
