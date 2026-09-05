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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QueryOptions {
  indexName?: 'gsi1' | 'gsi2' | 'gsi3' | 'gsi4';
  skPrefix?: string;
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
    return (r.Item as T | undefined) ?? null;
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
      items: (r.Items ?? []) as T[],
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
