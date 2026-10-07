import { Module } from '@nestjs/common';
import { CoreHubModule } from '../core-hub/core-hub.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [CoreHubModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
