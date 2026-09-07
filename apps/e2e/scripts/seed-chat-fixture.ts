/**
 * Sets up 004/US1's device journeys, and prints what the flows need.
 *
 * One device cannot drive two people, so the other participant is seeded here
 * and the ASSERTION happens in the app. Two conversations, deliberately:
 *
 *   - a REQUEST: from somebody the device person does not follow, so it must
 *     land in the Requests inbox with no notification (FR-003, FR-004)
 *   - an ACCEPTED one: the device person follows this sender, so it goes
 *     straight to the main inbox
 *
 * Seeding both is what makes the request assertion mean something: a flow that
 * only checked the Requests inbox would pass against an app that put every
 * conversation there.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-chat-fixture.ts <device-token>
 * Prints REQUESTER=, FRIEND=, REQUEST_BODY= and FRIEND_BODY=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { actor } from '../support/client';
import { baseUrl } from '../support/base-url';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-chat-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });
  const me = await device.session.me();

  const requester = await actor('devreq');
  // createProfile sets displayName to the prefix, so this IS the friend's
  // display name as the inbox renders it. Printed below because 14 asserts on
  // it - see FRIEND_NAME.
  const friendPrefix = 'devfriend';
  const friend = await actor(friendPrefix);

  // The device person follows the friend, so the friend's first message is
  // accepted rather than requested. FR-003 keys on the RECIPIENT's follow.
  await device.people.follow(friend.handle);

  const requestBody = 'a request from someone you do not follow';
  const friendBody = 'a message from someone you follow';

  const request = await requester.data.conversations.open(me.handle);
  await requester.data.conversations.send(request.conversationId, { body: requestBody });

  const accepted = await friend.data.conversations.open(me.handle);
  await friend.data.conversations.send(accepted.conversationId, { body: friendBody });

  // Assert the fixture produced what it claims BEFORE the flows depend on it.
  // A fixture that quietly seeded two requests would make the device flow fail
  // as a missing element, twenty minutes in, looking like a broken app.
  const requested = await device.conversations.list({ state: 'requested' });
  const inbox = await device.conversations.list({ state: 'accepted' });
  if (!requested.items.some((c) => c.conversationId === request.conversationId)) {
    throw new Error('fixture: the request did not land in the Requests inbox');
  }
  if (!inbox.items.some((c) => c.conversationId === accepted.conversationId)) {
    throw new Error('fixture: the followed sender did not land in the main inbox');
  }

  process.stdout.write(`REQUESTER=${requester.handle}\n`);
  process.stdout.write(`FRIEND=${friend.handle}\n`);
  /**
   * The friend's DISPLAY NAME, which the inbox row renders above the preview.
   *
   * 14-message-request used to assert on FRIEND_BODY to prove the followed
   * sender is in the main inbox. That works only while nothing has replied:
   * 13-send-message sends into the same conversation, the row's preview becomes
   * the new message, and 14 waits thirty seconds for a string that is correctly
   * no longer there. It passed for two runs purely because Maestro happened to
   * run 14 before 13; sorting the flows made the coupling deterministic, which
   * is the useful half of sorting them.
   *
   * A last-message preview is mutable BY DEFINITION. The participant's name is
   * what identifies the row, so that is what the assertion should read.
   */
  process.stdout.write(`FRIEND_NAME=${friendPrefix}\n`);
  process.stdout.write(`REQUEST_BODY=${requestBody}\n`);
  process.stdout.write(`FRIEND_BODY=${friendBody}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
