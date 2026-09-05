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

/** MinIO speaks the S3 API, so this is a true emulation - not a divergence (D9). */
export class MinioObjectStore implements ObjectStore {
  private readonly s3: S3Client;

  constructor(private readonly config: AppConfig) {
    this.s3 = new S3Client({
      endpoint: config.objectStore.endpoint,
      region: config.objectStore.region,
      forcePathStyle: config.objectStore.forcePathStyle,
      ...(config.objectStore.credentials ? { credentials: config.objectStore.credentials } : {}),
    });
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
    const base = this.config.objectStore.endpoint ?? '';
    return `${base}/${this.config.objectStore.bucket}/${key}`;
  }
}
