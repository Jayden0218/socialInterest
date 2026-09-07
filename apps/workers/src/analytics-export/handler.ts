export interface AnalyticsExportInput {
  /** Inclusive ISO date bounds for the export window. */
  from: string;
  to: string;
}

export interface AnalyticsRow {
  eventType: string;
  occurredAt: string;
  attributes: Record<string, string | number | boolean | null>;
}

export interface AnalyticsExportDeps {
  /** Reads the change stream, never the operational table's indexes. */
  readChanges(input: AnalyticsExportInput): AsyncIterable<AnalyticsRow>;
  writeBatch(rows: AnalyticsRow[], key: string): Promise<void>;
}

const BATCH_SIZE = 500;

/**
 * SC-007 and SC-008 are aggregate questions - what fraction of posts land in a
 * sub-interest that already has posts, and what fraction of new sub-interests
 * are later merged away as duplicates.
 *
 * DynamoDB cannot answer either without scanning, so aggregation NEVER touches
 * the operational table (research D3). Changes are streamed to object storage
 * partitioned by date, and the questions are asked there.
 *
 * Keeping this one-directional matters: an analytics query that reached back
 * into the live table would put reporting load on the path SC-005 budgets.
 */
export async function handleAnalyticsExport(
  input: AnalyticsExportInput,
  deps: AnalyticsExportDeps,
): Promise<{ rowsExported: number; batches: number }> {
  let batch: AnalyticsRow[] = [];
  let rowsExported = 0;
  let batches = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const key = `analytics/dt=${input.from.slice(0, 10)}/part-${String(batches).padStart(5, '0')}.json`;
    await deps.writeBatch(batch, key);
    rowsExported += batch.length;
    batches++;
    batch = [];
  };

  for await (const row of deps.readChanges(input)) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return { rowsExported, batches };
}
