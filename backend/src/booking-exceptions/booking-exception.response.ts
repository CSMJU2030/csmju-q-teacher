import { ApiProperty } from '@nestjs/swagger';
import { BookingException, ExceptionStatus } from '../../generated/prisma/client';

/** One change to a teacher's weekly office hours on one date. */
export class BookingExceptionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  teacherCoreUserId!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ enum: ExceptionStatus })
  status!: ExceptionStatus;

  @ApiProperty({ nullable: true, type: String })
  reason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export function toBookingExceptionResponse(row: BookingException): BookingExceptionResponse {
  return {
    id: row.id,
    teacherCoreUserId: row.teacherCoreUserId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
