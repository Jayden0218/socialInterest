import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';
import type { ObjectStore, PresignedUpload } from '../../ports';

/**
 * S3. Written and unit-tested; never applied by any task in tasks.md.
 * Provisioning requires explicit approval - plan.md Cost Posture.
 */
export class S3ObjectStore implements ObjectStore {
  private readonly s3: S3Client;

  constructor(private readonly config: AppConfig) {
    this.s3 = new S3Client({ region: config.objectStore.region });
  }

  async createUploadTarget(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresIn = input.expiresInSeconds ?? 900;
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.config.objectStore.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn },
    );
    return {
      uploadId: randomUUID(),
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      key: input.key,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    const r = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.objectStore.bucket, Key: key }),
    );
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.objectStore.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.config.objectStore.bucket, Key: key }),
    );
  }

  publicUrl(key: string): string {
    return `https://${this.config.objectStore.bucket}.s3.${this.config.objectStore.region}.amazonaws.com/${key}`;
  }
}
