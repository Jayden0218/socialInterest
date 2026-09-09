import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { InterestAdminController } from './interest-admin.controller';
import { InterestJobService } from './interest-job.service';
import { AppealController, AppealAdminController } from './appeal.controller';
import { AppealService } from './appeal.service';
import { OperatorGuard } from '../../common/auth/operator.guard';

@Module({
  controllers: [ModerationController, InterestAdminController, AppealController, AppealAdminController],
  providers: [InterestJobService, OperatorGuard, AppealService],
  exports: [InterestJobService],
})
export class ModerationModule {}
