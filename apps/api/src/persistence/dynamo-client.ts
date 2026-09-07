import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AppConfig } from '../config/configuration';

/**
 * DynamoDB has NO adapter, unlike every other managed service (research D9):
 * DynamoDB Local speaks the same wire API as the managed service, so the
 * persistence layer is identical in both profiles. Do not add an abstraction.
 */
export function createDocumentClient(config: AppConfig): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: config.dynamo.region,
    ...(config.dynamo.endpoint ? { endpoint: config.dynamo.endpoint } : {}),
    ...(config.profile === 'local'
      ? { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export const DOC_CLIENT = Symbol('DocumentClient');
