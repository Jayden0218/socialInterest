import { Controller, Delete, HttpCode, HttpStatus, Inject, Param, Put, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { InterestFollowService } from './interest-follow.service';

/** FR-027. Both verbs are idempotent, so a retried tap is harmless. */
@Controller('interests')
export class InterestFollowController {
  constructor(@Inject(InterestFollowService) private readonly follows: InterestFollowService) {}

  @Put(':interestId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(@Req() req: AppRequest, @Param('interestId') interestId: string): Promise<void> {
    await this.follows.follow(req.viewer!.userId, interestId);
  }

  @Delete(':interestId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(@Req() req: AppRequest, @Param('interestId') interestId: string): Promise<void> {
    await this.follows.unfollow(req.viewer!.userId, interestId);
  }
}
