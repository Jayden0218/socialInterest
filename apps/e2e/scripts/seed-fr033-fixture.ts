/**
 * Sets up the FR-033 negative case for a device journey, and prints what the
 * flow needs to assert on.
 *
 * FR-033 and constitution Principle I (NON-NEGOTIABLE): following a PERSON must
 * never widen the feed beyond followed interests. So the fixture is:
 *
 *   - an author, with two posts: one in an interest the device person follows,
 *     one in an interest they do not
 *   - the device person follows that author
 *
 * A feed that shows the second post has widened. That is the whole requirement,
 * and it is only visible as an ABSENCE - which is why the positive post is
 * seeded too: a flow that asserts only the absence would also pass against a
 * feed that failed to load at all.
 *
 * The setup is server-side because it has to be: two people cannot be driven
 * through one device's UI. The ASSERTION is in the app, in
 * .maestro/12-interest-follow-does-not-widen.yaml.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-fr033-fixture.ts <device-token>
 * Prints two lines: `PRESENT=<caption>` and `ABSENT=<caption>`.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { operations } from '@sih/shared';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { baseUrl } from '../support/base-url';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-fr033-fixture.ts <device-token>\n');
  process.exit(2);
}
// Bound after the guard: `process.exit` does not narrow the type for TypeScript,
// and the token is threaded through two clients below.
const token: string = argToken;

/**
 * The person-follow is issued directly rather than through the app's data
 * layer, because THE APP HAS NO WAY TO FOLLOW A PERSON. `ProfileContainer`
 * loads only the signed-in person's own profile, hardcodes
 * `viewerIsFollowing: false`, and its follow button calls `() => undefined`;
 * `apps/mobile/src/data` exposes no person-follow method at all, though the
 * contract and the generated client both have one.
 *
 * That gap is tracked separately. It does not weaken this fixture: FR-033 is a
 * requirement about what the FEED shows, and the person-follow is its
 * precondition. Establishing the precondition server-side is the honest way to
 * test the requirement while the app cannot establish it itself.
 */
async function followPerson(handle: string): Promise<void> {
  const op = operations.putPeopleByHandleFollow;
  const res = await fetch(`${baseUrl()}/v1${op.path.replace('{handle}', handle)}`, {
    method: op.method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`follow ${handle} failed: ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  const author = await actor('fr033author');
  const tops = await author.data.interests.listTop({ limit: 2 });
  const followed = tops.items[0];
  const other = tops.items[1];
  if (!followed || !other) throw new Error('the catalogue needs at least two top interests');

  const stamp = Date.now().toString(36);
  const present = `fr033 present ${stamp}`;
  const absent = `fr033 absent ${stamp}`;

  await publishReadyImage(author, [followed.interestId], { caption: present });
  await publishReadyImage(author, [other.interestId], { caption: absent });

  // The device person follows ONE interest and the author. If following the
  // author widened anything, the second post would arrive.
  const deviceData = createAppData({
    baseUrl: `${baseUrl()}/v1`,
    tokens: (() => {
      const t = new MemoryTokenStore();
      t.set(token);
      return t;
    })(),
  });
  await deviceData.interests.follow(followed.interestId);
  await followPerson(author.handle);

  process.stderr.write(
    `seeded: author=@${author.handle} followed=${followed.name} unfollowed=${other.name}\n`,
  );
  process.stdout.write(`PRESENT=${present}\nABSENT=${absent}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`fixture failed: ${String(err)}\n`);
  process.exit(1);
});
