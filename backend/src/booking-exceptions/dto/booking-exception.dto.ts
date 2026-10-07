import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ExceptionStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whose exception it is comes from the verified token, never from the body -
 * ValidationPipe's forbidNonWhitelisted rejects a smuggled teacherCoreUserId.
 */
export class CreateBookingExceptionDto {
  /** ISO 8601 with a timezone, e.g. 2026-10-05T12:00:00+07:00 */
  @ApiProperty({ format: 'date-time', example: '2026-10-05T12:00:00+07:00' })
  @IsDateString({ strict: true }, { message: 'startsAt ต้องเป็นวันเวลา ISO 8601 พร้อมเขตเวลา' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-05T13:00:00+07:00' })
  @IsDateString({ strict: true }, { message: 'endsAt ต้องเป็นวันเวลา ISO 8601 พร้อมเขตเวลา' })
  endsAt!: string;

  @ApiProperty({ enum: ExceptionStatus, description: 'AVAILABLE = เปิดเวลานี้ให้จอง · UNAVAILABLE = ปิดเวลานี้' })
  @IsEnum(ExceptionStatus, { message: 'status ต้องเป็น AVAILABLE หรือ UNAVAILABLE' })
  status!: ExceptionStatus;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'reason ต้องเป็นข้อความ' })
  @Length(0, 200, { message: 'reason ต้องยาวไม่เกิน 200 ตัวอักษร' })
  reason?: string;
}

export class QueryBookingExceptionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 64, description: 'ค่า sub ของอาจารย์ (ไม่ใช่ UUID เสมอไป)' })
  @IsOptional()
  @IsString({ message: 'teacherCoreUserId ต้องเป็นข้อความ' })
  @Length(1, 64, { message: 'teacherCoreUserId ต้องยาว 1-64 ตัวอักษร' })
  teacherCoreUserId?: string;

  /** First Bangkok calendar date to include, `YYYY-MM-DD`. */
  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  from?: string;

  /** Last Bangkok calendar date to include, `YYYY-MM-DD`. */
  @ApiPropertyOptional({ example: '2026-10-09' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  to?: string;
}
