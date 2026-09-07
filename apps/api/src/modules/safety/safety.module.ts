import { Module } from '@nestjs/common';
import { SafetyController } from './safety.controller';
import { ReportService } from './report.service';
import { BlockService } from './block.service';

@Module({
  controllers: [SafetyController],
  providers: [ReportService, BlockService],
  exports: [ReportService, BlockService],
})
export class SafetyModule {}
