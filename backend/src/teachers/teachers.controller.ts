import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope } from '../common/swagger/api-envelope';
import { TeacherResponse, TeachersService } from './teachers.service';

@ApiTags('teachers')
@Controller('v1/teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'อาจารย์ที่เปิดเวลาทำการแล้ว (ใช้เลือกดูตาราง)' })
  @ApiEnvelope(TeacherResponse, { collection: true })
  async findAll(@Query() query: PaginationQueryDto) {
    const { items, total } = await this.teachers.findAll(query.skip, query.take);
    return new CollectionResult(items, buildPaginationMeta(total, query.page ?? 1, query.take));
  }
}
