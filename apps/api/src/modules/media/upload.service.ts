import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../common/errors/problem.filter';
import { MEDIA_LIMITS, isSupportedContentType, type MediaKind } from '../../config/media.limits';
import { OBJECT_STORE, type ObjectStore, type PresignedUpload } from '../../ports';
import { UploadRepository } from '../../persistence/upload.repository';

export interface UploadRequest {
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
}

/**
 * FR-005: every cap is checked HERE, before a presigned target is issued, so the
 * caller learns of a limit up front rather than after a long upload completes.
 * That ordering is the requirement, not an optimisation.
 *
 * FR-008: the returned uploadId is quoted when creating the post, so a failed
 * upload can be retried against the same target without re-selecting the media.
 */
@Injectable()
export class UploadService {
  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(UploadRepository) private readonly uploads: UploadRepository,
  ) {}

  async createTarget(userId: string, req: UploadRequest): Promise<PresignedUpload> {
    const limits = MEDIA_LIMITS[req.kind];

    if (!isSupportedContentType(req.kind, req.contentType)) {
      throw new DomainError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'Unsupported media type',
        `${req.contentType} is not accepted for ${req.kind}. Accepted: ${limits.contentTypes.join(', ')}`,
      );
    }

    if (req.sizeBytes > limits.maxBytes) {
      throw new DomainError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'File too large',
        `${req.kind} may be at most ${Math.floor(limits.maxBytes / 1024 / 1024)} MB`,
      );
    }

    if (req.kind === 'video') {
      if (req.durationMs === undefined) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          'durationMs is required for video so the duration cap can be checked before upload',
        );
      }
      if (req.durationMs > MEDIA_LIMITS.video.maxDurationMs) {
        throw new DomainError(
          HttpStatus.PAYLOAD_TOO_LARGE,
          'Video too long',
          `Video may be at most ${MEDIA_LIMITS.video.maxDurationMs / 1000} seconds`,
        );
      }
    }

    const uploadId = randomUUID();
    const key = `uploads/${userId}/${uploadId}`;
    const target = await this.store.createUploadTarget({ key, contentType: req.contentType });

    // Persist what was issued, to whom. POST /posts then quotes the uploadId alone
    // and the server derives key and kind from here. Taking them from the request
    // body instead let a caller attach another person's media to their own post,
    // because nothing checked that the supplied key was theirs.
    await this.uploads.record({
      uploadId,
      userId,
      key,
      kind: req.kind === 'avatar' ? 'image' : req.kind,
      contentType: req.contentType,
      ...(req.durationMs !== undefined ? { durationMs: req.durationMs } : {}),
      createdAt: new Date().toISOString(),
    });

    // The store mints its own uploadId; ours is the one the post creation quotes,
    // and it must map back to this key (FR-008 retry without re-selecting media).
    return { ...target, uploadId, key };
  }
}
