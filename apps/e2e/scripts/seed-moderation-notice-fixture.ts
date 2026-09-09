/**
 * Sets up 008/US14's device journey, and prints what the flow needs.
 *
 * A moderation notice cannot be produced from the device: it takes a post, a
 * reporter and a MODERATOR, and the device drives one ordinary person. So this
 * does the whole round trip server-side and leaves the app the two things only
 * the app can show — that the author is told what and why (FR-046), and that
 * they can disagree (FR-047).
 *
 * The post is the DEVICE PERSON'S OWN, deliberately: the notice is addressed to
 * the person whose content was removed, so seeding somebody else's removal would
 * leave the device's list empty and the flow waiting thirty seconds on a screen
 * that is working correctly.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-moderation-notice-fixture.ts <device-token>
 * Prints REMOVED_ACTION_ID=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { actor } from '../support/client';
import { baseUrl } from '../support/base-url';
import { publishReadyImage } from '../support/publish';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-moderation-notice-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });

  const top = await device.interests.listTop({ limit: 1 });
  const interestId = top.items[0]?.interestId;
  if (!interestId) throw new Error('fixture: the catalogue is empty');

  /**
   * READY, not merely published. A pending post is visible only to its author,
   * so the reporter below would be refused and the fixture would fail for a
   * reason that is the visibility boundary working.
   */
  const postId = await publishReadyImage(
    { ...(await currentActor(device, token)) },
    [interestId],
    { caption: 'a post that a moderator is about to remove' },
  );

  const reporter = await actor('modreporter');
  const filed = await reporter.data.safety.report({
    subjectType: 'post',
    subjectId: postId,
    reason: 'explicit',
  });
  if (!filed.reportId) throw new Error('fixture: the report was not created');

  const operator = await actor('modoperator', { isOperator: true });
  await operator.data.safety.decide(filed.reportId, {
    state: 'actioned',
    action: 'remove_content',
    note: 'internal: fixture',
  });

  /**
   * ASSERT THE NOTICE EXISTS, from the DEVICE PERSON'S side, before printing.
   *
   * The whole flow depends on one row being in one list. A fixture that removed
   * a post and never checked would make the device fail as a thirty-second
   * timeout on an empty screen twenty minutes into a run — the failure every
   * other fixture here has a check to prevent.
   */
  const notices = await device.safety.moderationNotices({ limit: 50 });
  const notice = notices.items.find((n) => n.subjectId === postId);
  if (!notice) {
    throw new Error(`fixture: no moderation notice reached the device person for ${postId}`);
  }
  if (notice.appealId) {
    throw new Error('fixture: this notice has already been appealed, so the flow cannot appeal it');
  }

  process.stdout.write(`REMOVED_ACTION_ID=${notice.actionId}\n`);
}

/**
 * `publishReadyImage` takes an `Actor`, which is a minted person plus its data
 * layer. The device person already exists, so this builds the same shape around
 * the token the runner passed rather than creating a second account — publishing
 * as anybody else would put the notice in the wrong person's list.
 */
async function currentActor(
  data: ReturnType<typeof createAppData>,
  deviceToken: string,
): Promise<{ userId: string; handle: string; token: string; data: ReturnType<typeof createAppData> }> {
  const me = await data.session.me();
  return { userId: me.userId, handle: me.handle, token: deviceToken, data };
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
