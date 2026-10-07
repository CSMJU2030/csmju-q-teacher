import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CoreHubJwtGuard } from './auth/guards/core-hub-jwt.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { BookingExceptionsModule } from './booking-exceptions/booking-exceptions.module';
import { BookingsModule } from './bookings/bookings.module';
import { ChatMessagesModule } from './chat-messages/chat-messages.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { OfficeHoursModule } from './office-hours/office-hours.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from './schedule/schedule.module';
import { TeachersModule } from './teachers/teachers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    OfficeHoursModule,
    BookingExceptionsModule,
    BookingsModule,
    ChatMessagesModule,
    ScheduleModule,
    TeachersModule,
  ],
  providers: [
    // Every route is authenticated unless explicitly marked @Public().
    { provide: APP_GUARD, useClass: CoreHubJwtGuard },
    // Authorization runs after authentication.
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
