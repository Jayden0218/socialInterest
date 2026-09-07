import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { env } from './env';

const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: env.region,
  credentials: env.creds,
  forcePathStyle: true,
});

async function main(): Promise<void> {
  const exists = await s3
    .send(new HeadBucketCommand({ Bucket: env.bucket }))
    .then(() => true)
    .catch(() => false);
  if (exists) {
    console.log(`bucket ${env.bucket} already exists`);
    return;
  }
  await s3.send(new CreateBucketCommand({ Bucket: env.bucket }));
  console.log(`created bucket ${env.bucket}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
