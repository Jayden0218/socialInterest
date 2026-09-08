/**
 * Sets up 007's device journeys, and prints what the flows need.
 *
 * REPLACES `seed-fr033-fixture.ts`, which seeded the negative case for a
 * requirement 007 withdrew: a followed person's post in an UNfollowed interest,
 * which the feed had to exclude. There is no such boundary any more (RS-001),
 * so a fixture producing that pair would be setting up an assertion nothing can
 * make.
 *
 * What one device still cannot do is be two people, so this seeds the other
 * author server-side and leaves the ASSERTIONS to the app:
 *
 *   - PRESENT: a post the device person will see on their feed, in an interest
 *     they have declared. Flow 09 reports it and flow 12 opens its interest.
 *   - AUTHOR: that author's handle, so a flow can reach their profile — the
 *     only route to another person in the app.
 *   - INTEREST: the interest's NAME, which is what the coloured word on the
 *     card actually renders (FR-024). A flow asserting on the id would wait
 *     thirty seconds for text nobody displays.
 *   - COLD_TOKEN: a SECOND, never-signed-in account, for the cold-start flow.
 *
 * COLD_TOKEN exists because `launchApp: clearState` clears the DEVICE and not
 * the server. FR-014 asks once per ACCOUNT, so the moment any earlier flow has
 * signed in and dismissed the picks, the device token has answered and the cold
 * start correctly never appears again. A flow reusing it would fail for a
 * reason that is the product working — the same shared-server coupling 005
 * recorded when a chained flow's follow toggle unfollowed a place.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-feed-fixture.ts <device-token>
 * Prints PRESENT=, AUTHOR=, INTEREST= and COLD_TOKEN=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { actor } from '../support/client';
import { baseUrl } from '../support/base-url';
import { publishReadyImage } from '../support/publish';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-feed-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });

  const author = await actor('devfeed');
  const interest = (await device.interests.listTop({ limit: 1 })).items[0];
  if (!interest) throw new Error('the catalogue is empty; seed it first');

  /**
   * The device person DECLARES the interest, so the post is in the candidate
   * set for a reason rather than by the luck of an exploration draw (FR-030).
   * A device flow that waited for a post exploration happened to surface would
   * fail intermittently twenty minutes into a 25-minute run, which is the most
   * expensive way this suite can fail.
   */
  await device.interests.follow(interest.interestId);

  const caption = `device feed ${Date.now().toString().slice(-6)}`;
  await publishReadyImage(author, [interest.interestId], { caption });

  /**
   * The cold-start account. It declares NOTHING — that is the point: FR-015
   * requires a populated feed for somebody who picks nothing, and this token is
   * how a device flow gets to be that person.
   */
  const newcomer = await actor('devcold');

  process.stdout.write(`PRESENT=${caption}\n`);
  process.stdout.write(`AUTHOR=${author.handle}\n`);
  process.stdout.write(`INTEREST=${interest.name}\n`);
  process.stdout.write(`COLD_TOKEN=${newcomer.token}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
