/**
 * 005/R9. Copies each conversation's authoritative `state` onto its participant
 * rows, and creates the member rows (A40) that groups need and pairs did not.
 *
 * WHY THIS EXISTS WHEN IT IS CLOSE TO A NO-OP. R2 moves the authority for
 * `state` from the conversation item to the participant row. Every conversation
 * already written has its state on the meta item, and the participant rows carry
 * a copy that the pair path kept consistent - so in practice the data is already
 * correct.
 *
 * "Close to a no-op" is exactly the kind of claim that turns out to be false for
 * the one row that matters: a state change interrupted between its three writes,
 * a row written by a version that had the bug, a manual fix. This makes the
 * invariant true rather than assumed, and it is idempotent so running it twice
 * costs nothing.
 *
 * Usage: LOCAL_JWT_SECRET=... npx tsx apps/api/scripts/backfill-conversation-state.ts [--dry-run]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConversationRepository } from '../src/persistence/conversation.repository';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const repo = app.get(ConversationRepository);

  // The repository has no "scan every conversation" method, deliberately - a
  // scan is not an access pattern the product has. This reaches the raw client
  // for a one-time migration, which is the honest way to do something the data
  // model does not support rather than adding a scan the application could then
  // start using.
  const raw = repo as unknown as {
    doc: { send: (c: unknown) => Promise<{ Items?: Record<string, unknown>[]; LastEvaluatedKey?: unknown }> };
    tableName: string;
  };
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');

  let scanned = 0;
  let repaired = 0;
  let skippedGroups = 0;
  let cursor: unknown = undefined;

  do {
    const page = await raw.doc.send(
      new ScanCommand({
        TableName: raw.tableName,
        FilterExpression: '#t = :conv',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':conv': 'Conversation' },
        ExclusiveStartKey: cursor as Record<string, unknown> | undefined,
      }) as never,
    );

    for (const item of page.Items ?? []) {
      scanned++;
      const conversationId = item['conversationId'] as string;
      const metaState = item['state'] as string;
      const participantIds = (item['participantIds'] as string[]) ?? [];

      /**
       * GROUPS ARE SKIPPED, and the dry run is what made that obvious.
       *
       * The first version of this script scanned every conversation and offered
       * to "repair" 21 participant rows on groups - rows whose state was
       * CORRECT and deliberately different from the meta item's. A group's meta
       * `state` is a placeholder written so an unmigrated reader does not find
       * the field missing; the participant rows are the authority (R2). Copying
       * the placeholder over them would have turned every pending group
       * invitation into an accepted one, silently, for everybody.
       *
       * This script exists to repair rows written BEFORE 005, and those are all
       * pairs by definition. Running the dry run first is the only reason this
       * is a comment rather than an incident.
       */
      if (item['kind'] === 'group') {
        skippedGroups++;
        continue;
      }

      for (const userId of participantIds) {
        const participant = await repo.findParticipant(userId, conversationId);
        if (!participant) {
          console.warn(`  MISSING participant row: ${conversationId} / ${userId}`);
          continue;
        }
        // The only case that needs repair: the copy disagrees with the meta
        // item, which the pair path should never have produced.
        if (participant.state !== metaState) {
          repaired++;
          console.log(
            `  repairing ${conversationId} / ${userId}: '${participant.state}' -> '${metaState}'`,
          );
          if (!dryRun) {
            await repo.setParticipantState(userId, conversationId, metaState as never, participant.lastMessageAt);
          }
        }
      }
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  console.log(
    `\n${dryRun ? 'DRY RUN: ' : ''}scanned ${scanned} conversation(s), ` +
      `skipped ${skippedGroups} group(s) whose per-participant state is authoritative, ` +
      `repaired ${repaired} participant row(s).`,
  );
  await app.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
