import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { InterestAdminController } from './interest-admin.controller';
import { InterestJobService } from './interest-job.service';
import { OperatorGuard } from '../../common/auth/operator.guard';

@Module({
  controllers: [ModerationController, InterestAdminController],
  providers: [InterestJobService, OperatorGuard],
  exports: [InterestJobService],
})
export class ModerationModule {}
