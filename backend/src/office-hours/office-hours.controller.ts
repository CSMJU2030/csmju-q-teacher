import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { CoreHubAccessToken } from '../auth/decorators/core-hub-access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope, DeletedModel } from '../common/swagger/api-envelope';
import { parseUuid } from '../common/uuid.pipe';
import { CreateOfficeHourDto, QueryOfficeHoursDto, UpdateOfficeHourDto } from './dto/office-hour.dto';
import { OfficeHourResponse, toOfficeHourResponse } from './office-hour.response';
import { OfficeHoursService } from './office-hours.service';

@ApiTags('office-hours')
@Controller('v1/office-hours')
export class OfficeHoursController {
  constructor(private readonly officeHours: OfficeHoursService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'เวลาทำการรายสัปดาห์ของอาจารย์ (กรองด้วย teacherCoreUserId)' })
  @ApiEnvelope(OfficeHourResponse, { collection: true })
  async findAll(@CurrentUser() user: CoreHubIdentity, @Query() query: QueryOfficeHoursDto) {
    const { items, total } = await this.officeHours.findAll(user, query);
    return new CollectionResult(
      items.map(toOfficeHourResponse),
      buildPaginationMeta(total, query.page ?? 1, query.take),
    );
  }

  @Post()
  @RequirePermissions(Permission.OFFICE_HOUR_CREATE)
  @ApiOperation({ summary: 'เพิ่มเวลาทำการของตัวเอง' })
  @ApiEnvelope(OfficeHourResponse, { status: 201 })
  async create(
    @CurrentUser() user: CoreHubIdentity,
    @Body() dto: CreateOfficeHourDto,
    @CoreHubAccessToken() token: string,
  ) {
    return toOfficeHourResponse(await this.officeHours.create(user, dto, token));
  }

  @Patch(':id')
  @RequirePermissions(Permission.OFFICE_HOUR_UPDATE_OWN, Permission.OFFICE_HOUR_UPDATE_ANY)
  @ApiOperation({ summary: 'แก้ไขเวลาทำการ' })
  @ApiEnvelope(OfficeHourResponse)
  async update(
    @CurrentUser() user: CoreHubIdentity,
    @Param('id', parseUuid()) id: string,
    @Body() dto: UpdateOfficeHourDto,
  ) {
    return toOfficeHourResponse(await this.officeHours.update(user, id, dto));
  }

  @Delete(':id')
  @RequirePermissions(Permission.OFFICE_HOUR_DELETE_OWN, Permission.OFFICE_HOUR_DELETE_ANY)
  @ApiOperation({ summary: 'ลบเวลาทำการ' })
  @ApiEnvelope(DeletedModel)
  remove(@CurrentUser() user: CoreHubIdentity, @Param('id', parseUuid()) id: string) {
    return this.officeHours.remove(user, id);
  }
}
