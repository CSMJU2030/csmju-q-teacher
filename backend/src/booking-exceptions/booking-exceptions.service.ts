import { Injectable } from '@nestjs/common';
import { BookingException, BookingStatus, ExceptionStatus, Prisma } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { Permission, can } from '../auth/permissions';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, localMidnight } from '../schedule/schedule.util';
import { CreateBookingExceptionDto, QueryBookingExceptionsDto } from './dto/booking-exception.dto';

/** An exception longer than this is almost certainly a typo. */
const MAX_EXCEPTION_MS = 24 * 60 * 60 * 1000;

/**
 * One-off changes to a teacher's weekly office hours: open a time that is
 * normally busy (AVAILABLE) or close one that is normally open (UNAVAILABLE).
 * "Undo" is a DELETE of the exception, so the history is never rewritten.
 */
@Injectable()
export class BookingExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: CoreHubIdentity,
    query: QueryBookingExceptionsDto,
  ): Promise<{ items: BookingException[]; total: number }> {
    const teacherCoreUserId =
      query.teacherCoreUserId ?? (user.subsystemRole === SubsystemRole.TEACHER ? user.id : undefined);

    const where: Prisma.BookingExceptionWhereInput = {
      teacherCoreUserId,
      // overlaps [from 00:00, to + 1 day 00:00) in Bangkok time
      ...(query.to ? { startsAt: { lt: localMidnight(addDays(query.to, 1)) } } : {}),
      ...(query.from ? { endsAt: { gt: localMidnight(query.from) } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.bookingException.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.bookingException.count({ where }),
    ]);
    return { items, total };
  }

  async create(user: CoreHubIdentity, dto: CreateBookingExceptionDto): Promise<BookingException> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw AppException.badRequest('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_EXCEPTION_MS) {
      throw AppException.badRequest('ช่วงเวลาต้องไม่ยาวเกิน 24 ชั่วโมง');
    }

    // Closing a time must not hide an appointment that is already in the queue.
    if (dto.status === ExceptionStatus.UNAVAILABLE) {
      const booked = await this.prisma.booking.findFirst({
        where: {
          teacherCoreUserId: user.id,
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (booked) {
        throw AppException.conflict('ช่วงเวลานี้มีนัดหมายที่ยืนยันแล้ว กรุณายกเลิกนัดหมายก่อนปิดเวลา', {
          bookingId: booked.id,
        });
      }
    }

    return this.prisma.bookingException.create({
      data: {
        teacherCoreUserId: user.id,
        startsAt,
        endsAt,
        status: dto.status,
        reason: dto.reason,
      },
    });
  }

  async remove(user: CoreHubIdentity, id: string): Promise<{ id: string; deleted: true }> {
    const row = await this.prisma.bookingException.findUnique({ where: { id } });
    if (!row) {
      throw AppException.notFound('ไม่พบรายการเปิด/ปิดเวลานี้');
    }
    if (
      row.teacherCoreUserId !== user.id &&
      !can(user.subsystemRole, Permission.BOOKING_EXCEPTION_DELETE_ANY)
    ) {
      throw AppException.forbidden('ลบได้เฉพาะรายการเปิด/ปิดเวลาของตัวเอง');
    }
    await this.prisma.bookingException.delete({ where: { id } });
    return { id, deleted: true };
  }
}
