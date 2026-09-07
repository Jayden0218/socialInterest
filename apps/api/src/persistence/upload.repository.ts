import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys } from './keys';

export interface UploadItem {
  uploadId: string;
  userId: string;
  key: string;
  kind: 'image' | 'video';
  contentType: string;
  durationMs?: number;
  createdAt: string;
}

/**
 * Issued upload targets. The record is what makes POST /posts able to accept an
 * uploadId alone: the server looks up who it was issued to and what it is, instead
 * of believing the client.
 *
 * Short-lived by design - an upload not quoted within a day is abandoned, and the
 * table's ttl attribute reaps it.
 */
@Injectable()
export class UploadRepository extends BaseRepository {
  private static readonly LIFETIME_SECONDS = 24 * 60 * 60;

  async record(item: UploadItem): Promise<void> {
    await this.putItem({
      ...keys.upload(item.uploadId),
      type: 'Upload',
      ...item,
      ttl: Math.floor(Date.now() / 1000) + UploadRepository.LIFETIME_SECONDS,
    });
  }

  async get(uploadId: string): Promise<UploadItem | null> {
    return this.getItem<UploadItem>(keys.upload(uploadId));
  }
}
