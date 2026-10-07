import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Whose office hours it is comes from the verified token, never from the body -
 * ValidationPipe's forbidNonWhitelisted rejects a smuggled teacherCoreUserId.
 */
export class CreateOfficeHourDto {
  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MON })
  @IsEnum(DayOfWeek, { message: 'dayOfWeek ต้องเป็น MON TUE WED THU หรือ FRI' })
  dayOfWeek!: DayOfWeek;

  /** Local Bangkok time of day, `HH:mm`. */
  @ApiProperty({ example: '09:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(TIME_PATTERN, { message: 'startTime ต้องอยู่ในรูปแบบ HH:mm เช่น 09:00' })
  startTime!: string;

  @ApiProperty({ example: '12:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(TIME_PATTERN, { message: 'endTime ต้องอยู่ในรูปแบบ HH:mm เช่น 12:00' })
  endTime!: string;

  @ApiPropertyOptional({ minimum: 5, maximum: 240, default: 30, description: 'ความยาวของช่วงนัด 1 ช่วง (นาที)' })
  @IsOptional()
  @IsInt({ message: 'slotMinutes ต้องเป็นจำนวนเต็ม' })
  @Min(5, { message: 'slotMinutes ต้องไม่น้อยกว่า 5 นาที' })
  @Max(240, { message: 'slotMinutes ต้องไม่เกิน 240 นาที' })
  slotMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'isAvailable ต้องเป็น true หรือ false' })
  isAvailable?: boolean;
}

export class UpdateOfficeHourDto extends PartialType(CreateOfficeHourDto) {}

export class QueryOfficeHoursDto extends PaginationQueryDto {
  /** Core Hub `sub` of the teacher - an opaque string, not a UUID. */
  @ApiPropertyOptional({ maxLength: 64, description: 'ค่า sub ของอาจารย์ (ไม่ใช่ UUID เสมอไป)' })
  @IsOptional()
  @IsString({ message: 'teacherCoreUserId ต้องเป็นข้อความ' })
  @Length(1, 64, { message: 'teacherCoreUserId ต้องยาว 1-64 ตัวอักษร' })
  teacherCoreUserId?: string;
}
