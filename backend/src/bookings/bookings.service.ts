import { Injectable } from '@nestjs/common';
import { Booking, BookingStatus, Prisma } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { Permission, can } from '../auth/permissions';
import { AppException } from '../common/errors';
import { PeopleService } from '../core-hub/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, localMidnight } from '../schedule/schedule.util';
import { BookingSort, CreateBookingDto, QueryBookingsDto } from './dto/booking.dto';

/** A booking with the numbers the screens show next to it. */
export interface BookingView {
  booking: Booking;
  unreadCount: number;
  studentFullNameTh: string | null;
}

/** Longest single appointment. */
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

/**
 * The queue of appointments. Only the teacher puts a student into it
 * (`booking:create`); the student looks at theirs and chats in it.
 *
 * A booking keeps both people as Core Hub ids only (reference-data.md 8):
 * `*CoreUserId` (the token's `sub`, or the `coreUserId` Core Hub gives for the
 * student's person code) and `*PersonCode`. Names are read from Core Hub when
 * one screen needs one and are never stored.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
  ) {}

  /** Admin sees every booking; a teacher the ones they run; a student their own. */
  async findAll(
    user: CoreHubIdentity,
    query: QueryBookingsDto,
  ): Promise<{ items: BookingView[]; total: number }> {
    const where: Prisma.BookingWhereInput = {
      status: query.status,
      ...(query.to ? { startsAt: { lt: localMidnight(addDays(query.to, 1)) } } : {}),
      ...(query.from ? { endsAt: { gt: localMidnight(query.from) } } : {}),
      ...this.scopeOf(user),
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: this.orderOf(query.sort),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const unread = await this.unreadByBooking(
      user,
      bookings.map((booking) => booking.id),
    );
    return {
      items: bookings.map((booking) => ({
        booking,
        unreadCount: unread.get(booking.id) ?? 0,
        studentFullNameTh: null,
      })),
      total,
    };
  }

  /**
   * One booking. The teacher (or an admin) also gets the student's name, read
   * from Core Hub now with their own token; if Core Hub cannot say, the screen
   * shows the person code instead.
   */
  async findOne(user: CoreHubIdentity, id: string, token: string): Promise<BookingView> {
    const booking = await this.load(user, id);
    const unread = await this.unreadByBooking(user, [id]);

    let studentFullNameTh: string | null = null;
    if (user.subsystemRole !== SubsystemRole.STUDENT && booking.studentPersonCode) {
      studentFullNameTh = await this.tryName(booking.studentPersonCode, token);
    }
    return { booking, unreadCount: unread.get(id) ?? 0, studentFullNameTh };
  }

  /** The teacher puts a student into their own queue. */
  async create(user: CoreHubIdentity, dto: CreateBookingDto, token: string): Promise<BookingView> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw AppException.badRequest('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) {
      throw AppException.badRequest('นัดหมายหนึ่งครั้งต้องไม่ยาวเกิน 4 ชั่วโมง');
    }
    if (startsAt.getTime() < Date.now()) {
      throw AppException.badRequest('ไม่สามารถนัดหมายย้อนหลังได้');
    }

    // The teacher's own queue first: it needs no call to Core Hub.
    await this.assertFree({ teacherCoreUserId: user.id }, startsAt, endsAt, 'คุณมีนัดหมายอื่นในช่วงเวลานี้แล้ว');

    // Personal data is never cached: asked now, with the teacher's own token.
    const student = await this.people.findByPersonCode(dto.studentPersonCode, token);
    if (!student) {
      throw AppException.badRequest('ไม่พบรหัสนี้ในข้อมูลกลาง กรุณาตรวจสอบรหัสนักศึกษา');
    }
    if (student.personType !== null && student.personType !== 'STUDENT') {
      throw AppException.badRequest('รหัสนี้ไม่ใช่รหัสนักศึกษา');
    }
    if (!student.coreUserId) {
      throw AppException.conflict('นักศึกษาคนนี้ยังไม่มีบัญชีผู้ใช้ในระบบกลาง จึงยังนัดหมายไม่ได้');
    }
    if (student.coreUserId === user.id) {
      throw AppException.badRequest('ไม่สามารถนัดหมายกับตัวเองได้');
    }

    await this.assertFree(
      { studentCoreUserId: student.coreUserId },
      startsAt,
      endsAt,
      'นักศึกษามีนัดหมายอื่นในช่วงเวลานี้แล้ว',
    );

    const teacherPersonCode = await this.people.myPersonCode(token);

    const booking = await this.prisma.booking.create({
      data: {
        teacherCoreUserId: user.id,
        teacherPersonCode,
        studentCoreUserId: student.coreUserId,
        studentPersonCode: student.personCode,
        startsAt,
        endsAt,
        topic: dto.topic,
        status: BookingStatus.CONFIRMED,
      },
    });
    return { booking, unreadCount: 0, studentFullNameTh: student.fullNameTh };
  }

  cancel(user: CoreHubIdentity, id: string): Promise<BookingView> {
    return this.close(user, id, BookingStatus.CANCELLED);
  }

  complete(user: CoreHubIdentity, id: string): Promise<BookingView> {
    return this.close(user, id, BookingStatus.COMPLETED);
  }

  private async close(user: CoreHubIdentity, id: string, status: BookingStatus): Promise<BookingView> {
    const booking = await this.load(user, id);

    const isTheTeacher = booking.teacherCoreUserId === user.id;
    if (!isTheTeacher && !can(user.subsystemRole, Permission.BOOKING_CLOSE_ANY)) {
      throw AppException.forbidden('ปิดนัดหมายได้เฉพาะอาจารย์เจ้าของคิวนี้');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw AppException.conflict('ปิดได้เฉพาะนัดหมายที่ยังยืนยันอยู่ (ตอนนี้สถานะเป็น ' + booking.status + ')');
    }

    const closed = await this.prisma.booking.update({
      where: { id },
      data: { status, closedByCoreUserId: user.id },
    });
    const unread = await this.unreadByBooking(user, [id]);
    return { booking: closed, unreadCount: unread.get(id) ?? 0, studentFullNameTh: null };
  }

  /** The stored booking, if the caller may see it. */
  private async load(user: CoreHubIdentity, id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw AppException.notFound('ไม่พบนัดหมายนี้');
    }
    // Someone else's booking is 403, never 404 (auth-contract 8, authorization 5):
    // the caller is known but holds only booking:read:own. Ids are random UUIDs,
    // so answering 403 tells nothing a guess could use.
    if (!this.canSee(user, booking)) {
      throw AppException.forbidden('เปิดดูได้เฉพาะนัดหมายของตัวเอง');
    }
    return booking;
  }

  private canSee(user: CoreHubIdentity, booking: Booking): boolean {
    return (
      can(user.subsystemRole, Permission.BOOKING_READ_ANY) ||
      booking.teacherCoreUserId === user.id ||
      booking.studentCoreUserId === user.id
    );
  }

  private scopeOf(user: CoreHubIdentity): Prisma.BookingWhereInput {
    if (can(user.subsystemRole, Permission.BOOKING_READ_ANY)) {
      return {};
    }
    return user.subsystemRole === SubsystemRole.TEACHER
      ? { teacherCoreUserId: user.id }
      : { studentCoreUserId: user.id };
  }

  private orderOf(sort: BookingSort | undefined): Prisma.BookingOrderByWithRelationInput[] {
    switch (sort) {
      case BookingSort.STARTS_AT_DESC:
        return [{ startsAt: 'desc' }, { id: 'asc' }];
      case BookingSort.CREATED_AT_DESC:
        return [{ createdAt: 'desc' }, { id: 'asc' }];
      default:
        return [{ startsAt: 'asc' }, { id: 'asc' }];
    }
  }

  /** Messages the other person sent in these bookings and the caller has not read. */
  private async unreadByBooking(user: CoreHubIdentity, ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ids.length === 0) {
      return counts;
    }
    const messages = await this.prisma.chatMessage.findMany({
      where: { bookingId: { in: ids }, isRead: false },
    });
    for (const message of messages) {
      if (message.senderCoreUserId !== user.id) {
        counts.set(message.bookingId, (counts.get(message.bookingId) ?? 0) + 1);
      }
    }
    return counts;
  }

  /** A name for one screen. Anything but an ended session just leaves the person code showing. */
  private async tryName(personCode: string, token: string): Promise<string | null> {
    try {
      return (await this.people.findByPersonCode(personCode, token))?.fullNameTh ?? null;
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 401) {
        throw error;
      }
      return null;
    }
  }

  /** Two appointments of the same person overlap when each starts before the other ends. */
  private async assertFree(
    who: { teacherCoreUserId: string } | { studentCoreUserId: string },
    startsAt: Date,
    endsAt: Date,
    message: string,
  ): Promise<void> {
    const clash = await this.prisma.booking.findFirst({
      where: {
        ...who,
        status: BookingStatus.CONFIRMED,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash) {
      throw AppException.conflict(message, {
        bookingId: clash.id,
        startsAt: clash.startsAt,
        endsAt: clash.endsAt,
      });
    }
  }
}
