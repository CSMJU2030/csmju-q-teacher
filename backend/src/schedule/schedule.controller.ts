import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope } from '../common/swagger/api-envelope';
import { QueryScheduleSlotsDto } from './dto/schedule-slots.dto';
import { ScheduleSlotResponse } from './schedule-slot.response';
import { ScheduleService } from './schedule.service';

@ApiTags('schedule-slots')
@Controller('v1/schedule-slots')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({
    summary: 'ช่วงนัดของอาจารย์ในสัปดาห์หนึ่ง (จันทร์-ศุกร์) เรียงตามเวลา — ส่ง limit=100 เพื่อได้ทั้งสัปดาห์',
  })
  @ApiEnvelope(ScheduleSlotResponse, { collection: true })
  async findSlots(@CurrentUser() user: CoreHubIdentity, @Query() query: QueryScheduleSlotsDto) {
    const { items, total } = await this.schedule.findSlots(user, query);
    return new CollectionResult(items, buildPaginationMeta(total, query.page ?? 1, query.take));
  }
}
