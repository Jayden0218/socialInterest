import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { DomainError } from '../../common/errors/problem.filter';
import { zodBody } from '../../common/http/validation';
import { DraftRepository } from '../../persistence/draft.repository';
import { UploadRepository } from '../../persistence/upload.repository';

const draftSchema = z.object({
  /** A draft is by definition unfinished, so EVERY field is optional. */
  draftId: z.string().optional(),
  caption: z.string().max(2000).optional(),
  interestIds: z.array(z.string().min(1)).max(10).default([]),
  placeId: z.string().min(1).nullable().optional(),
  uploadIds: z.array(z.string().min(1)).max(10).default([]),
  altTexts: z.record(z.string(), z.string().max(300)).optional(),
});

/**
 * 008/US11 — FR-037, FR-038, FR-039. FINISH IT LATER.
 *
 * Under `/me`, which is where this codebase puts everything private by key: the
 * route says whose it is, and the key makes that true rather than trusting the
 * route to (A49).
 *
 * Nothing here validates the way publishing does. A draft with no interest is
 * the ordinary case — it is the field people fill in last — and refusing to
 * SAVE what somebody has not finished would defeat the story. 001/FR-006 is
 * enforced at publish, where it belongs.
 */
@Controller('me/drafts')
export class DraftController {
  constructor(
    @Inject(DraftRepository) private readonly drafts: DraftRepository,
    @Inject(UploadRepository) private readonly uploads: UploadRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async save(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(draftSchema, body);
    return this.drafts.save({
      userId: req.viewer!.userId,
      ...(input.draftId ? { draftId: input.draftId } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      interestIds: input.interestIds ?? [],
      ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
      uploadIds: input.uploadIds ?? [],
      ...(input.altTexts ? { altTexts: input.altTexts } : {}),
    });
  }

  @Get()
  async list(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.drafts.list(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_drafts' : null,
      },
    };
  }

  /**
   * FR-039 — RESTORED, WITH THE TRUTH ABOUT ITS MEDIA.
   *
   * An upload target expires after a day. A restore that returned the stored
   * ids regardless would fail at publish with a validation error nobody
   * expects; one that dropped them silently would look exactly like a draft
   * that had lost data. So the response says which are gone, and the client
   * says it out loud.
   */
  @Get(':draftId')
  async get(@Req() req: AppRequest, @Param('draftId') draftId: string) {
    const draft = await this.drafts.find(req.viewer!.userId, draftId);
    // 404 for somebody else's, and for one that never existed: a draft's very
    // EXISTENCE is the private part, which is why this differs from a comment.
    if (!draft) throw new DomainError(HttpStatus.NOT_FOUND, 'No such draft');

    const present: string[] = [];
    const expired: string[] = [];
    for (const uploadId of draft.uploadIds) {
      const record = await this.uploads.get(uploadId);
      if (record && record.userId === req.viewer!.userId) present.push(uploadId);
      else expired.push(uploadId);
    }
    return { ...draft, uploadIds: present, expiredUploadIds: expired };
  }

  @Delete(':draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AppRequest, @Param('draftId') draftId: string): Promise<void> {
    const draft = await this.drafts.find(req.viewer!.userId, draftId);
    if (!draft) throw new DomainError(HttpStatus.NOT_FOUND, 'No such draft');
    await this.drafts.remove(req.viewer!.userId, draftId);
  }
}
