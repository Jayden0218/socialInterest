import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Put, Query, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { SavedService } from './saved.service';

@Controller()
export class SavedController {
  constructor(@Inject(SavedService) private readonly saved: SavedService) {}

  /** FR-037. Refused for a post the caller cannot currently see. */
  @Put('posts/:postId/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(@Req() req: AppRequest, @Param('postId') postId: string): Promise<void> {
    await this.saved.save(req.viewer!.userId, postId);
  }

  @Delete('posts/:postId/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(@Req() req: AppRequest, @Param('postId') postId: string): Promise<void> {
    await this.saved.unsave(req.viewer!.userId, postId);
  }

  /**
   * FR-038, FR-039. SURFACE 9.
   *
   * Private BY KEY - saved rows live under the owner's own partition and no
   * index projects them, so there is no query anyone else can write that
   * reaches them. There is deliberately no endpoint that takes a person's
   * handle: an endpoint that could is one an authorisation bug can expose.
   */
  @Get('me/saved')
  async list(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.saved.list(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 20)) : 20,
      cursor: cursor ?? null,
    });
  }
}
