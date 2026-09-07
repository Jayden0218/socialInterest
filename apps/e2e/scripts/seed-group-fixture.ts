/**
 * Sets up 005/US3's device journey, and prints what the flow needs.
 *
 * One device drives one person, so the other three come from here.
 * `21-group-chat.yaml` searches for each by handle, adds two of them at
 * creation and the third afterwards.
 *
 * The three FOLLOW the device person, deliberately. FR-022 keys the invitation
 * state on whether the invitee follows the creator, so without the follows every
 * invitation would be `requested` - the group would still be created and the
 * flow would still pass, while quietly exercising a different path from the one
 * a person creating a group with friends takes.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-group-fixture.ts <device-token>
 * Prints GROUP_MEMBER_A=, GROUP_MEMBER_B= and GROUP_MEMBER_C=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { actor } from '../support/client';
import { baseUrl } from '../support/base-url';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-group-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });
  const me = await device.session.me();

  const members = [];
  for (const prefix of ['grpmembera', 'grpmemberb', 'grpmemberc']) {
    const member = await actor(prefix);
    // FR-022: the INVITEE's follow decides, not the creator's.
    await member.data.people.follow(me.handle);
    members.push(member);
  }

  /**
   * ASSERT THE FIXTURE PRODUCED WHAT IT CLAIMS, before the flow depends on it.
   *
   * A fixture that seeded people the search cannot find would make the device
   * flow fail as a thirty-second timeout on a missing element, twenty minutes
   * into a run, looking exactly like a broken search screen. This is the same
   * reason `seed-chat-fixture` checks its two inboxes.
   */
  for (const member of members) {
    const found = await device.people.search(member.handle, { limit: 20 });
    if (!found.items.some((p) => p.handle === member.handle)) {
      throw new Error(`fixture: ${member.handle} is not findable by the search the flow uses`);
    }
    /**
     * Asked FROM THE MEMBER'S SIDE, because the direction is the whole point.
     * `device.people.get(member).viewerIsFollowing` answers "do I follow them",
     * which is the opposite of what FR-022 keys on and would have passed here
     * while the invitations all landed as requests.
     */
    const asMember = await member.data.people.get(me.handle);
    if (!asMember.viewerIsFollowing) {
      throw new Error(`fixture: ${member.handle} does not follow the device person`);
    }
  }

  /**
   * And the device person must have NO group called what the flow creates.
   * The flow asserts the row appears and then disappears after leaving; a
   * leftover group of the same name from an earlier run would make both
   * assertions pass without the flow having done anything.
   */
  const inbox = await device.conversations.list({ state: 'accepted', limit: 50 });
  if (inbox.items.some((c) => c.name === 'Climbing Tuesday')) {
    throw new Error('fixture: a group named "Climbing Tuesday" already exists for this person');
  }

  process.stdout.write(`GROUP_MEMBER_A=${members[0]!.handle}\n`);
  process.stdout.write(`GROUP_MEMBER_B=${members[1]!.handle}\n`);
  process.stdout.write(`GROUP_MEMBER_C=${members[2]!.handle}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
