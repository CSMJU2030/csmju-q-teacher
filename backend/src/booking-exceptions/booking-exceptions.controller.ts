import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope, DeletedModel } from '../common/swagger/api-envelope';
import { parseUuid } from '../common/uuid.pipe';
import { BookingExceptionResponse, toBookingExceptionResponse } from './booking-exception.response';
import { BookingExceptionsService } from './booking-exceptions.service';
import { CreateBookingExceptionDto, QueryBookingExceptionsDto } from './dto/booking-exception.dto';

@ApiTags('booking-exceptions')
@Controller('v1/booking-exceptions')
export class BookingExceptionsController {
  constructor(private readonly exceptions: BookingExceptionsService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'รายการเปิด/ปิดเวลาเฉพาะวันของอาจารย์' })
  @ApiEnvelope(BookingExceptionResponse, { collection: true })
  async findAll(@CurrentUser() user: CoreHubIdentity, @Query() query: QueryBookingExceptionsDto) {
    const { items, total } = await this.exceptions.findAll(user, query);
    return new CollectionResult(
      items.map(toBookingExceptionResponse),
      buildPaginationMeta(total, query.page ?? 1, query.take),
    );
  }

  @Post()
  @RequirePermissions(Permission.BOOKING_EXCEPTION_CREATE)
  @ApiOperation({ summary: 'เปิดหรือปิดเวลาเฉพาะช่วงของตัวเอง' })
  @ApiEnvelope(BookingExceptionResponse, { status: 201 })
  async create(@CurrentUser() user: CoreHubIdentity, @Body() dto: CreateBookingExceptionDto) {
    return toBookingExceptionResponse(await this.exceptions.create(user, dto));
  }

  @Delete(':id')
  @RequirePermissions(
    Permission.BOOKING_EXCEPTION_DELETE_OWN,
    Permission.BOOKING_EXCEPTION_DELETE_ANY,
  )
  @ApiOperation({ summary: 'ยกเลิกรายการเปิด/ปิดเวลา (ย้อนกลับไปใช้เวลาทำการรายสัปดาห์)' })
  @ApiEnvelope(DeletedModel)
  remove(@CurrentUser() user: CoreHubIdentity, @Param('id', parseUuid()) id: string) {
    return this.exceptions.remove(user, id);
  }
}
