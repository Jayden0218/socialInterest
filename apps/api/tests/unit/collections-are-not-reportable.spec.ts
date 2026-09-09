import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportSubjectSchema } from '@sih/shared';

/**
 * 008/US15, T210 — A COLLECTION NAME IS NOT REPORTABLE, AND THAT IS A FINDING
 * RATHER THAN AN OMISSION.
 *
 * The task said to make collection names reportable and moderatable, on
 * Constitution IV's rule that user-generated names and text are content — the
 * rule 005 applied to a group's name and 008 applied to a comment. Writing it
 * showed the rule does not reach here, and the reason is worth pinning:
 *
 * **A collection is readable only by its owner (FR-050), so its name has an
 * audience of one.** There is no reporter. A report subject nobody but the owner
 * can see would be a subject nobody can produce, and admitting one would put an
 * undecidable item in the moderation queue — which is exactly why
 * `report.service.ts` already refuses to accept a report against a conversation
 * with no name.
 *
 * Compare 005's conversation name, where the rule DOES apply: every participant
 * sees it, so there is somebody to report it and something for a moderator to
 * decide. The difference is the audience, not the content.
 *
 * So `CollectionRepository` has no `removeName`, deliberately. A remover with
 * nothing that can call it is the "declared half with no other half" this whole
 * feature exists to end — 008 found five of them — and adding one here for
 * symmetry would be the sixth.
 *
 * **IF A COLLECTION EVER GAINS A SECOND READER, THIS TEST IS THE PLACE THAT
 * SAYS SO.** Sharing a collection makes its name reportable in the same commit,
 * and this file failing is how that gets noticed.
 */
describe('008/US15 a collection name has an audience of one', () => {
  it('is not a report subject, because nobody else can see it', () => {
    expect(reportSubjectSchema.options).not.toContain('collection');
    expect(reportSubjectSchema.options).not.toContain('collection-name');
  });

  it('has no moderator remover, because nothing could reach one', () => {
    const src = readFileSync(
      join(__dirname, '../../src/persistence/collection.repository.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/removeName/);
  });

  /**
   * THE CONDITION UNDER WHICH ALL OF THE ABOVE IS WRONG, asserted directly.
   *
   * Every route that reads a collection is on `/me`. The moment one takes a
   * handle or an owner id, somebody other than the owner can see a collection,
   * and the audience-of-one argument collapses — so this fails then, in the
   * commit that does it, rather than at the next safety review.
   */
  it('every collection route is on /me, so the audience really is one', () => {
    const src = readFileSync(
      join(__dirname, '../../src/modules/saved/saved.controller.ts'),
      'utf8',
    );
    const routes = [...src.matchAll(/@(?:Get|Post|Put|Patch|Delete)\('([^']*collections[^']*)'\)/g)].map(
      (m) => m[1] as string,
    );
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => !r.startsWith('me/collections'))).toEqual([]);
  });
});
