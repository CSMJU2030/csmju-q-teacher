import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryScheduleSlotsDto extends PaginationQueryDto {
  /** Core Hub `sub` of the teacher - an opaque string, not a UUID. A teacher who names nobody sees their own. */
  @ApiPropertyOptional({ maxLength: 64, description: 'ค่า sub ของอาจารย์ (ไม่ใช่ UUID เสมอไป) — อาจารย์ไม่ระบุ = ตารางของตัวเอง' })
  @IsOptional()
  @IsString({ message: 'teacherCoreUserId ต้องเป็นข้อความ' })
  @Length(1, 64, { message: 'teacherCoreUserId ต้องยาว 1-64 ตัวอักษร' })
  teacherCoreUserId?: string;

  /** Any Bangkok calendar date; the week (Monday to Friday) that contains it is returned. Today when left out. */
  @ApiPropertyOptional({ example: '2026-10-05', description: 'วันใดก็ได้ในสัปดาห์ที่ต้องการ (วันนี้ถ้าไม่ระบุ)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  weekStart?: string;
}
