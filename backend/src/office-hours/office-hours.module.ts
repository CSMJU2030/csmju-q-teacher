import { Module } from '@nestjs/common';
import { CoreHubModule } from '../core-hub/core-hub.module';
import { OfficeHoursController } from './office-hours.controller';
import { OfficeHoursService } from './office-hours.service';

@Module({
  imports: [CoreHubModule],
  controllers: [OfficeHoursController],
  providers: [OfficeHoursService],
})
export class OfficeHoursModule {}
