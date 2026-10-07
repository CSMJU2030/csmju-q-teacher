import { ApiProperty } from '@nestjs/swagger';
import { Booking, BookingStatus } from '../../generated/prisma/client';

/** One appointment in a teacher's queue, as the API returns it. */
export class BookingResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'ค่า sub ของอาจารย์' })
  teacherCoreUserId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'รหัสบุคลากรจาก Core Hub (แสดงแทนชื่อ)' })
  teacherPersonCode!: string | null;

  @ApiProperty({ description: 'ค่า sub ของนักศึกษา' })
  studentCoreUserId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'รหัสนักศึกษาจาก Core Hub (แสดงแทนชื่อ)' })
  studentPersonCode!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'ชื่อนักศึกษา อ่านจาก Core Hub ตอนเปิดดูรายการเดียวและเฉพาะผู้ที่มีสิทธิ์อ่านข้อมูลบุคคล — ไม่เก็บในฐานข้อมูล',
  })
  studentFullNameTh!: string | null;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty()
  topic!: string;

  @ApiProperty({ enum: BookingStatus })
  status!: BookingStatus;

  @ApiProperty({ description: 'จำนวนข้อความในคิวนี้ที่อีกฝ่ายส่งมาและยังไม่ได้อ่าน' })
  unreadCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export function toBookingResponse(
  booking: Booking,
  extra: { unreadCount?: number; studentFullNameTh?: string | null } = {},
): BookingResponse {
  return {
    id: booking.id,
    teacherCoreUserId: booking.teacherCoreUserId,
    teacherPersonCode: booking.teacherPersonCode,
    studentCoreUserId: booking.studentCoreUserId,
    studentPersonCode: booking.studentPersonCode,
    studentFullNameTh: extra.studentFullNameTh ?? null,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    topic: booking.topic,
    status: booking.status,
    unreadCount: extra.unreadCount ?? 0,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}
