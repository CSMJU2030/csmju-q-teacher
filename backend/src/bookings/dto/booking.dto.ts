import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { BookingStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** A Core Hub person code: a student code, or the front of a staff email. Never a Core Hub `code` of a dataset. */
const PERSON_CODE_PATTERN = /^[A-Za-z0-9._-]{1,50}$/;

/**
 * Who the booking is for is a person code the teacher types; the teacher
 * themselves is the verified token. A smuggled teacherCoreUserId or
 * studentCoreUserId is rejected by ValidationPipe's forbidNonWhitelisted.
 */
export class CreateBookingDto {
  /** รหัสนักศึกษา (personCode ใน Core Hub) */
  @ApiProperty({ example: '6704101312', maxLength: 50 })
  @Matches(PERSON_CODE_PATTERN, { message: 'studentPersonCode ต้องเป็นรหัสนักศึกษา (ตัวอักษร ตัวเลข . _ - ไม่เกิน 50 ตัว)' })
  studentPersonCode!: string;

  /** ISO 8601 with a timezone, e.g. 2026-10-12T09:00:00+07:00 */
  @ApiProperty({ format: 'date-time', example: '2026-10-12T09:00:00+07:00' })
  @IsDateString({ strict: true }, { message: 'startsAt ต้องเป็นวันเวลา ISO 8601 พร้อมเขตเวลา' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-12T09:30:00+07:00' })
  @IsDateString({ strict: true }, { message: 'endsAt ต้องเป็นวันเวลา ISO 8601 พร้อมเขตเวลา' })
  endsAt!: string;

  @ApiProperty({ minLength: 1, maxLength: 200, example: 'ปรึกษาโครงงานพิเศษ' })
  @IsString({ message: 'topic ต้องเป็นข้อความ' })
  @Length(1, 200, { message: 'topic ต้องยาว 1-200 ตัวอักษร' })
  topic!: string;
}

export enum BookingSort {
  STARTS_AT = 'startsAt',
  STARTS_AT_DESC = '-startsAt',
  CREATED_AT_DESC = '-createdAt',
}

export class QueryBookingsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus, { message: 'status ต้องเป็น CONFIRMED CANCELLED หรือ COMPLETED' })
  status?: BookingStatus;

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

  @ApiPropertyOptional({ enum: BookingSort, default: BookingSort.STARTS_AT })
  @IsOptional()
  @IsEnum(BookingSort, { message: 'sort ต้องเป็น startsAt, -startsAt หรือ -createdAt' })
  sort?: BookingSort;
}
