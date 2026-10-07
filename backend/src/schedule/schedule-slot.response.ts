import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../../generated/prisma/client';

/** The appointment in a BOOKED slot - shown only to the teacher whose schedule it is. */
export class SlotBookingModel {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, type: String, description: 'รหัสนักศึกษา (แสดงแทนชื่อ)' })
  studentPersonCode!: string | null;

  @ApiProperty()
  topic!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;
}

/**
 * One bookable stretch of a teacher's week. A time with no slot is busy: the
 * teacher is not available then.
 */
export class ScheduleSlotResponse {
  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ enum: ['AVAILABLE', 'BOOKED'] })
  status!: 'AVAILABLE' | 'BOOKED';

  @ApiProperty({ description: 'นัดหมายในช่วงนี้เป็นของผู้เรียกเอง' })
  bookedByMe!: boolean;

  @ApiProperty({
    nullable: true,
    type: SlotBookingModel,
    description: 'รายละเอียดนัดหมาย — เห็นเฉพาะอาจารย์เจ้าของตารางและผู้ดูแลระบบ คนอื่นเห็นแค่ว่าไม่ว่าง',
  })
  booking!: SlotBookingModel | null;
}
