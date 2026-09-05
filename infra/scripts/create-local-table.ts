import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  type GlobalSecondaryIndex,
} from '@aws-sdk/client-dynamodb';
import { env } from './env';

const client = new DynamoDBClient({
  endpoint: env.dynamoEndpoint,
  region: env.region,
  credentials: env.creds,
});

// data-model.md § Key schema. GSI1 Lookup, GSI2 ByAuthor, GSI3 Hierarchy, GSI4 Inverted.
const gsi = (n: number): GlobalSecondaryIndex => ({
  IndexName: `gsi${n}`,
  KeySchema: [
    { AttributeName: `gsi${n}pk`, KeyType: 'HASH' },
    { AttributeName: `gsi${n}sk`, KeyType: 'RANGE' },
  ],
  Projection: { ProjectionType: 'ALL' },
});

async function main(): Promise<void> {
  const recreate = process.argv.includes('--recreate');
  if (recreate) {
    await client.send(new DeleteTableCommand({ TableName: env.tableName })).catch(() => undefined);
  } else {
    const exists = await client
      .send(new DescribeTableCommand({ TableName: env.tableName }))
      .then(() => true)
      .catch(() => false);
    if (exists) {
      console.log(`table ${env.tableName} already exists`);
      return;
    }
  }

  await client.send(
    new CreateTableCommand({
      TableName: env.tableName,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        ...[1, 2, 3, 4].flatMap((n) => [
          { AttributeName: `gsi${n}pk`, AttributeType: 'S' as const },
          { AttributeName: `gsi${n}sk`, AttributeType: 'S' as const },
        ]),
      ],
      GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3), gsi(4)],
    }),
  );
  console.log(`created ${env.tableName} with gsi1-gsi4`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
