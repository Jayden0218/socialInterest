/**
 * Sets up 008/US13's device journey, and prints what the flow needs.
 *
 * One device drives one person, so the requester comes from here — the same
 * reason `seed-group-fixture` exists.
 *
 * THE ORDER MATTERS AND IS THE WHOLE FIXTURE. A follow only becomes a REQUEST
 * when the account is private at the moment it is made, so this sets the device
 * person private, has the requester follow, and sets them back to open. The
 * pending row survives that, because nothing about flipping privacy touches
 * follow rows — which is 008/FR-045's mechanism, exercised here as a
 * precondition rather than asserted as a claim.
 *
 * It ends OPEN so `34-private-account.yaml` can turn privacy on itself: a toggle
 * is not idempotent, and a flow that tapped a switch already in the target state
 * would turn it off and then fail for a reason that is the product working
 * (005, run 32).
 *
 * Usage: npx tsx apps/e2e/scripts/seed-follow-request-fixture.ts <device-token>
 * Prints FOLLOW_REQUESTER=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { actor } from '../support/client';
import { baseUrl } from '../support/base-url';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-follow-request-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });
  const me = await device.session.me();

  await device.session.updateProfile({ accountPrivacy: 'private' });

  const requester = await actor('followreq');
  await requester.data.people.follow(me.handle);

  /**
   * ASSERT IT IS PENDING, from the requester's own side, BEFORE going back to
   * open. `viewerIsFollowing` is false for a pending row and for no row at all,
   * so the boolean cannot tell the fixture whether the follow happened —
   * checking it would be the `seed-group-fixture` mistake of asserting a
   * different question from the one that matters.
   */
  const asRequester = await requester.data.people.get(me.handle);
  if (asRequester.viewerFollowState !== 'pending') {
    throw new Error(
      `fixture: expected a pending request from ${requester.handle}, got ${String(asRequester.viewerFollowState)}`,
    );
  }

  await device.session.updateProfile({ accountPrivacy: 'open' });

  /**
   * And the request is still there afterwards, which is what the flow opens the
   * screen expecting. A fixture that left the queue empty would make the flow
   * time out on a missing row twenty minutes into a run, looking exactly like a
   * broken screen — the failure `seed-group-fixture`'s own check exists to stop.
   */
  const queue = await device.people.followRequests({ limit: 50 });
  if (!queue.items.some((p) => p.handle === requester.handle)) {
    throw new Error(`fixture: ${requester.handle} is not in the device person's follow-request list`);
  }

  process.stdout.write(`FOLLOW_REQUESTER=${requester.handle}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
