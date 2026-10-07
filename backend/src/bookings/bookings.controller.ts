import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { CoreHubAccessToken } from '../auth/decorators/core-hub-access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope } from '../common/swagger/api-envelope';
import { parseUuid } from '../common/uuid.pipe';
import { BookingResponse, toBookingResponse } from './booking.response';
import { BookingsService, BookingView } from './bookings.service';
import { CreateBookingDto, QueryBookingsDto } from './dto/booking.dto';

const present = ({ booking, unreadCount, studentFullNameTh }: BookingView) =>
  toBookingResponse(booking, { unreadCount, studentFullNameTh });

@ApiTags('bookings')
@Controller('v1/bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions(Permission.BOOKING_READ_ANY, Permission.BOOKING_READ_OWN)
  @ApiOperation({ summary: 'คิวนัดหมายของฉัน (อาจารย์เห็นคิวที่ตัวเองดูแล นักศึกษาเห็นคิวของตัวเอง)' })
  @ApiEnvelope(BookingResponse, { collection: true })
  async findAll(@CurrentUser() user: CoreHubIdentity, @Query() query: QueryBookingsDto) {
    const { items, total } = await this.bookings.findAll(user, query);
    return new CollectionResult(items.map(present), buildPaginationMeta(total, query.page ?? 1, query.take));
  }

  @Get(':id')
  @RequirePermissions(Permission.BOOKING_READ_ANY, Permission.BOOKING_READ_OWN)
  @ApiOperation({ summary: 'ดูนัดหมายรายการเดียว' })
  @ApiEnvelope(BookingResponse)
  async findOne(
    @CurrentUser() user: CoreHubIdentity,
    @Param('id', parseUuid()) id: string,
    @CoreHubAccessToken() token: string,
  ) {
    return present(await this.bookings.findOne(user, id, token));
  }

  @Post()
  @RequirePermissions(Permission.BOOKING_CREATE)
  @ApiOperation({ summary: 'อาจารย์สร้างนัดหมายให้นักศึกษาในคิวของตัวเอง' })
  @ApiEnvelope(BookingResponse, { status: 201 })
  async create(
    @CurrentUser() user: CoreHubIdentity,
    @Body() dto: CreateBookingDto,
    @CoreHubAccessToken() token: string,
  ) {
    return present(await this.bookings.create(user, dto, token));
  }

  @Patch(':id/cancel')
  @RequirePermissions(Permission.BOOKING_CLOSE_OWN, Permission.BOOKING_CLOSE_ANY)
  @ApiOperation({ summary: 'ยกเลิกนัดหมาย (ช่วงเวลากลับไปว่าง)' })
  @ApiEnvelope(BookingResponse)
  async cancel(@CurrentUser() user: CoreHubIdentity, @Param('id', parseUuid()) id: string) {
    return present(await this.bookings.cancel(user, id));
  }

  @Patch(':id/complete')
  @RequirePermissions(Permission.BOOKING_CLOSE_OWN, Permission.BOOKING_CLOSE_ANY)
  @ApiOperation({ summary: 'ทำเครื่องหมายว่านัดหมายเสร็จสิ้น' })
  @ApiEnvelope(BookingResponse)
  async complete(@CurrentUser() user: CoreHubIdentity, @Param('id', parseUuid()) id: string) {
    return present(await this.bookings.complete(user, id));
  }
}
