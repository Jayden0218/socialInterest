import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { UploadService } from './upload.service';

const uploadRequestSchema = z.object({
  kind: z.enum(['image', 'video', 'avatar']),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  durationMs: z.number().int().positive().optional(),
});

@Controller('media')
export class MediaController {
  constructor(@Inject(UploadService) private readonly uploads: UploadService) {}

  /** FR-004, FR-005, FR-008. */
  @Post('uploads')
  @RateLimit({ capacity: 30, refillPerSecond: 0.5 })
  async createUpload(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(uploadRequestSchema, body);
    const target = await this.uploads.createTarget(req.viewer!.userId, input);
    return {
      uploadId: target.uploadId,
      url: target.url,
      method: target.method,
      headers: target.headers,
      expiresAt: target.expiresAt,
    };
  }
}
