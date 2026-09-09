import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { decodeCursor, encodeCursor } from './cursor';

/**
 * Attributes DynamoDB stores that describe WHERE an item lives, not what it is.
 *
 * A loaded item carries these, and re-spreading them over a freshly built key
 * silently writes back to the old location. Stripping them at the boundary means
 * a rewrite always lands where its key builder says.
 */
const KEY_ATTRIBUTES = [
  'pk',
  'sk',
  'gsi1pk',
  'gsi1sk',
  'gsi2pk',
  'gsi2sk',
  'gsi3pk',
  'gsi3sk',
  'gsi4pk',
  'gsi4sk',
  'gsi5pk',
  'gsi5sk',
] as const;

export function stripKeys<T extends Record<string, unknown>>(item: T): T {
  const out = { ...item };
  for (const attribute of KEY_ATTRIBUTES) delete out[attribute];
  return out;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QueryOptions {
  indexName?: 'gsi1' | 'gsi2' | 'gsi3' | 'gsi4' | 'gsi5';
  skPrefix?: string;
  /** 008/A44. Everything after this sort key. Mutually exclusive with skPrefix. */
  skGreaterThan?: string;
  limit?: number;
  cursor?: string | null;
  ascending?: boolean;
  filter?: { expression: string; names?: Record<string, string>; values?: Record<string, unknown> };
}

/** Shared single-table access. Every repository extends this. */
export abstract class BaseRepository {
  constructor(
    protected readonly doc: DynamoDBDocumentClient,
    protected readonly tableName: string,
  ) {}

  protected async getItem<T>(key: Record<string, string>): Promise<T | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: key }));
    return r.Item ? (stripKeys(r.Item) as T) : null;
  }

  protected async putItem(item: Record<string, unknown>, condition?: string): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ...(condition ? { ConditionExpression: condition } : {}),
      }),
    );
  }

  protected async deleteItem(key: Record<string, string>): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: key }));
  }

  protected async increment(
    key: Record<string, string>,
    attribute: string,
    by: number,
  ): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: 'ADD #a :n',
        ExpressionAttributeNames: { '#a': attribute },
        ExpressionAttributeValues: { ':n': by },
      }),
    );
  }

  /**
   * Set named attributes on an existing item.
   *
   * Update rather than put, so a partial write cannot race a concurrent one into
   * resurrecting fields it was not touching.
   */
  protected async updateItem(
    key: Record<string, string>,
    values: Record<string, unknown>,
    condition?: string,
  ): Promise<void> {
    const entries = Object.entries(values);
    if (entries.length === 0) return;
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(', ')}`,
        ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
        ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
        ...(condition ? { ConditionExpression: condition } : {}),
      }),
    );
  }

  protected async query<T>(partitionKey: string, opts: QueryOptions = {}): Promise<Page<T>> {
    const pkName = opts.indexName ? `${opts.indexName}pk` : 'pk';
    const skName = opts.indexName ? `${opts.indexName}sk` : 'sk';

    const names: Record<string, string> = { '#pk': pkName, ...(opts.filter?.names ?? {}) };
    const values: Record<string, unknown> = { ':pk': partitionKey, ...(opts.filter?.values ?? {}) };
    let condition = '#pk = :pk';
    if (opts.skPrefix !== undefined) {
      names['#sk'] = skName;
      values[':skPrefix'] = opts.skPrefix;
      condition += ' AND begins_with(#sk, :skPrefix)';
    } else if (opts.skGreaterThan !== undefined) {
      /**
       * 008/A44. A RANGE on the sort key, for "everything after this point".
       *
       * Mutually exclusive with `skPrefix` - DynamoDB takes one sort-key
       * condition, and offering both would silently drop one. The caller builds
       * the full prefixed value (`NOTIF#<timestamp>`), so the prefix is still
       * what bounds the scan; this only moves the start of it.
       */
      names['#sk'] = skName;
      values[':skFrom'] = opts.skGreaterThan;
      condition += ' AND #sk > :skFrom';
    }

    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        ...(opts.indexName ? { IndexName: opts.indexName } : {}),
        KeyConditionExpression: condition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...(opts.filter ? { FilterExpression: opts.filter.expression } : {}),
        ScanIndexForward: opts.ascending ?? false,
        Limit: opts.limit ?? 20,
        ExclusiveStartKey: decodeCursor(opts.cursor),
      }),
    );

    return {
      items: (r.Items ?? []).map((i) => stripKeys(i) as T),
      nextCursor: encodeCursor(r.LastEvaluatedKey),
    };
  }

  /**
   * Atomic multi-item write. This is what makes FR-017 possible: a visibility
   * change lands on the post item and every one of its index items, or on none.
   */
  protected async transact(items: TransactWriteCommandInput['TransactItems']): Promise<void> {
    if (!items || items.length === 0) return;
    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }
}
