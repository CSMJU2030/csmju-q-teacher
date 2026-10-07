import { ApiProperty } from '@nestjs/swagger';
import { DayOfWeek, OfficeHour } from '../../generated/prisma/client';
import { formatTimeOfDay } from '../schedule/schedule.util';

/** One weekly stretch of office hours, as the API returns it. */
export class OfficeHourResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'ค่า sub ของอาจารย์เจ้าของเวลา' })
  teacherCoreUserId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'รหัสบุคลากรจาก Core Hub (แสดงแทนชื่อ)' })
  teacherPersonCode!: string | null;

  @ApiProperty({ enum: DayOfWeek })
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '09:00', description: 'เวลาท้องถิ่น Asia/Bangkok รูปแบบ HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  endTime!: string;

  @ApiProperty({ example: 30 })
  slotMinutes!: number;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export function toOfficeHourResponse(row: OfficeHour): OfficeHourResponse {
  return {
    id: row.id,
    teacherCoreUserId: row.teacherCoreUserId,
    teacherPersonCode: row.teacherPersonCode,
    dayOfWeek: row.dayOfWeek,
    startTime: formatTimeOfDay(row.startMinute),
    endTime: formatTimeOfDay(row.endMinute),
    slotMinutes: row.slotMinutes,
    isAvailable: row.isAvailable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
