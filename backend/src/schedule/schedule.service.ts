import { Injectable } from '@nestjs/common';
import { Booking } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { Permission, can } from '../auth/permissions';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { QueryScheduleSlotsDto } from './dto/schedule-slots.dto';
import { ScheduleSlotResponse } from './schedule-slot.response';
import { addDays, buildDaySlots, localDateOf, localMidnight, weekDates } from './schedule.util';

/**
 * A teacher's week, worked out on the server: the weekly office hours, then
 * the one-off exceptions, then the appointments (schedule.util.ts). Everyone
 * may look; only the teacher whose week it is (and an admin) sees who booked.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async findSlots(
    user: CoreHubIdentity,
    query: QueryScheduleSlotsDto,
  ): Promise<{ items: ScheduleSlotResponse[]; total: number }> {
    const teacherCoreUserId =
      query.teacherCoreUserId ?? (user.subsystemRole === SubsystemRole.TEACHER ? user.id : undefined);
    if (!teacherCoreUserId) {
      throw AppException.badRequest('กรุณาระบุ teacherCoreUserId ของอาจารย์ที่ต้องการดูตาราง');
    }

    const anchor = query.weekStart ?? localDateOf(new Date());
    if (addDays(anchor, 0) !== anchor) {
      throw AppException.badRequest('weekStart ไม่ใช่วันที่ที่มีอยู่จริง');
    }

    const dates = weekDates(anchor);
    const windowStart = localMidnight(dates[0]);
    const windowEnd = localMidnight(addDays(dates[dates.length - 1], 1));
    const overlapsWeek = { startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } };

    const [officeHours, exceptions, bookings] = await Promise.all([
      this.prisma.officeHour.findMany({ where: { teacherCoreUserId } }),
      // oldest first: the newest decision on the same time wins (schedule.util.ts)
      this.prisma.bookingException.findMany({
        where: { teacherCoreUserId, ...overlapsWeek },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.booking.findMany({ where: { teacherCoreUserId, ...overlapsWeek } }),
    ]);

    const seesBookings =
      teacherCoreUserId === user.id || can(user.subsystemRole, Permission.BOOKING_READ_ANY);

    const all = dates
      .flatMap((date) => buildDaySlots<Booking>(date, officeHours, exceptions, bookings))
      .map((slot): ScheduleSlotResponse => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status: slot.status,
        bookedByMe: slot.booking?.studentCoreUserId === user.id,
        booking:
          slot.booking && seesBookings
            ? {
                id: slot.booking.id,
                studentPersonCode: slot.booking.studentPersonCode,
                topic: slot.booking.topic,
                status: slot.booking.status,
              }
            : null,
      }));

    return { items: all.slice(query.skip, query.skip + query.take), total: all.length };
  }
}
