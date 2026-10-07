import { Module } from '@nestjs/common';
import { BookingExceptionsController } from './booking-exceptions.controller';
import { BookingExceptionsService } from './booking-exceptions.service';

@Module({
  controllers: [BookingExceptionsController],
  providers: [BookingExceptionsService],
})
export class BookingExceptionsModule {}
