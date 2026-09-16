import { randomUUID } from 'node:crypto';
import type { Interest } from '@sih/shared';
import type { Actor } from './client';
import { publishReadyNamingInterest } from './publish';

/**
 * AN INTEREST TO PUBLISH INTO, AND WHY THIS FILE HAD TO EXIST.
 *
 * Until 013 the store came up with twelve curated interests in it, so ninety-eight
 * places in this suite opened with
 *
 *     const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
 *
 * and simply went on. 013 deleted the catalogue — FR-017: the product ships with
 * no interests of its own — and `resetStore` stopped seeding one. Every one of
 * those lines then read `undefined`, and the suite failed forty-six times with
 * `Cannot read properties of undefined (reading 'interestId')`.
 *
 * That is worth recording precisely, because 013 believed it had handled this.
 * `reset.ts` says the `seed:catalogue` callers "were hunted rather than left to
 * fail" — and they were: nothing calls `seed:catalogue`. What was missed is the
 * SECOND-ORDER dependency, every test that depended not on the seeder but on
 * what the seeder left behind. A grep for the removed thing cannot find those.
 * Only running the suite could, and this environment could not run it, because
 * MinIO is unreachable here (CLAUDE.md's dead-ends table). It would have been
 * found by CI, as a red build.
 *
 * WHAT THIS DOES NOT DO is restore a seeded catalogue. An interest is created
 * the one way a person can create one — by naming it on a publish — so the
 * suite exercises the product rather than a fixture that contradicts FR-004.
 * It is created ONCE PER RUN and reused: the store is shared across files, so
 * the first file to ask pays for it and the rest find it already there.
 */

/** A name no run can collide with, and far enough from any other that FR-008's
 *  near-duplicate gate cannot refuse it — two names differing by one character
 *  score over the blocking threshold, which is why this is not a counter. */
const fixtureName = (): string => `Fixture ${randomUUID().slice(0, 8)}`;

/**
 * One interest, reused across the whole run.
 *
 * Reads before it writes: on any run but the first file's, this is a single GET.
 */
export async function anInterest(who: Actor): Promise<Interest> {
  const [first] = await someInterests(who, 1);
  return first!;
}

/**
 * `n` DISTINCT interests, reused across the run and created only as needed.
 *
 * Callers that need two are asking for two different spaces — "a post in this
 * one is absent from that one" — so the distinctness is the point, not an
 * incidental property of the old catalogue's first two rows.
 */
export async function someInterests(who: Actor, n: number): Promise<Interest[]> {
  const page = await who.data.interests.listTop({ limit: 50 });
  const usable = page.items.filter((i) => i.state === 'active');
  if (usable.length >= n) return usable.slice(0, n);

  const made: Interest[] = [...usable];
  for (let i = usable.length; i < n; i++) {
    const { interestId } = await publishReadyNamingInterest(who, fixtureName(), {
      // NO CAPTION, deliberately. Post search indexes caption terms, and a
      // fixture post whose words appear in somebody else's search result is the
      // "grown table" failure this project has recorded four times.
      caption: undefined,
    });
    made.push(await who.data.interests.get(interestId));
  }
  return made;
}
