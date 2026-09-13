/**
 * 010. THE DATASTORE IS SPOKEN TO IN ONE DIRECTORY, AND NOWHERE ELSE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: the plan was wrong, and this is what found it
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `010/plan.md` says the seam is already in the right place — seven methods on
 * `base.repository.ts`, four files, 554 lines touching the SDK — and the whole
 * migration was sized on that. It is not true. FIVE files outside `persistence/`
 * build and send their own `TransactWriteCommand` against the injected document
 * client, at TEN call sites, bypassing `BaseRepository.transact` entirely:
 *
 *   modules/posts/post.transaction.ts               3 sites
 *   modules/posts/post-update.transaction.ts        2 sites
 *   modules/engagement/reaction.service.ts          2 sites
 *   modules/engagement/comment-update.transaction.ts 1 site
 *   modules/safety/block.service.ts                 1 site
 *
 * That matters for two reasons, and the second is worse than the first.
 *
 * 1. The seven-primitive contract test (`datastore-primitives.spec.ts`) proves
 *    `BaseRepository.transact` applies all-or-none. It says NOTHING about these
 *    ten, because they never call it. A migration that ported the base class
 *    and left them alone would have a green contract and five unported call
 *    sites — and `transact`'s all-or-none guarantee is what makes 001/FR-017
 *    possible.
 *
 * 2. It is the shape this project keeps paying for: a declared seam with work
 *    happening either side of it. A feed with a second hand-rolled responder, a
 *    `VisibilityFilter` with six hand-written predicates beside it, a
 *    notification category in the list that DESCRIBES and not the one that
 *    RENDERS. The seam existed; it was just not the only way through.
 *
 * So the rule is mechanical rather than a matter of care: NOTHING outside
 * `src/persistence/` may name the DynamoDB SDK. Services that need a
 * transaction take `Transactor`, which is inside the seam.
 *
 * `adapters/local/minio-object-store.ts` is deliberately not covered: it speaks
 * `@aws-sdk/client-s3` to an S3-compatible endpoint, which is a different
 * service and, per 010/R6, needs no change at all.
 */
import { join } from 'node:path';
import { forbiddenReferences } from './support/forbidden-imports';

const SRC = join(__dirname, '..', '..', 'src');

/**
 * The identifiers a module would have to name to reach the datastore directly.
 *
 * Both packages, because `client-dynamodb` is how a raw client is built and
 * `lib-dynamodb` is how every command is. Naming only one leaves the other as
 * an unwatched door.
 */
const DATASTORE_SDK = ['@aws-sdk/lib-dynamodb', '@aws-sdk/client-dynamodb'];

describe('one datastore seam', () => {
  it('is not reached from modules/', () => {
    expect(forbiddenReferences([join(SRC, 'modules')], DATASTORE_SDK)).toEqual([]);
  });

  it('is not reached from adapters/, ports/ or common/', () => {
    // Where a second datastore implementation would otherwise start to grow —
    // and 010/R2 defers that remodelling deliberately rather than by accident.
    expect(
      forbiddenReferences(
        [join(SRC, 'adapters'), join(SRC, 'ports'), join(SRC, 'common')],
        ['@aws-sdk/lib-dynamodb', '@aws-sdk/client-dynamodb'],
      ),
    ).toEqual([]);
  });

  /**
   * AND THE GUARD MUST HAVE A SUBJECT.
   *
   * `hooks-before-return.test.ts` read a file BY NAME, the file's contents moved
   * out from under it, and it went green over an empty list in the same run that
   * reported 253 tests passing. `expect(offenders).toEqual([])` is vacuously
   * true over nothing at all, so this asserts the scan actually found the tree
   * it is supposed to be scanning.
   */
  it('scanned a real tree, so an empty result means something', () => {
    const everything = forbiddenReferences([join(SRC, 'modules')], ['@nestjs/common']);
    expect(everything.length).toBeGreaterThan(20);
  });
});
