import { Injectable } from '@nestjs/common';
import { DayOfWeek, OfficeHour, Prisma } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { Permission, can } from '../auth/permissions';
import { AppException } from '../common/errors';
import { PeopleService } from '../core-hub/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTimeOfDay } from '../schedule/schedule.util';
import { CreateOfficeHourDto, QueryOfficeHoursDto, UpdateOfficeHourDto } from './dto/office-hour.dto';

const DEFAULT_SLOT_MINUTES = 30;

/**
 * The weekly office hours of each teacher. A teacher edits only their own;
 * `office-hour:update:any` / `delete:any` (admin) reaches everyone's.
 *
 * Whose they are is the verified token's `sub` (`teacherCoreUserId`) and, for
 * display, the person code Core Hub gives for that same token - no name and no
 * email is kept (reference-data.md 8).
 */
@Injectable()
export class OfficeHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
  ) {}

  /** Everyone may look; a teacher who names nobody sees their own. */
  async findAll(
    user: CoreHubIdentity,
    query: QueryOfficeHoursDto,
  ): Promise<{ items: OfficeHour[]; total: number }> {
    const teacherCoreUserId =
      query.teacherCoreUserId ?? (user.subsystemRole === SubsystemRole.TEACHER ? user.id : undefined);
    const where: Prisma.OfficeHourWhereInput = { teacherCoreUserId };

    const [items, total] = await Promise.all([
      this.prisma.officeHour.findMany({
        where,
        orderBy: [
          { teacherCoreUserId: 'asc' },
          { dayOfWeek: 'asc' },
          { startMinute: 'asc' },
          { id: 'asc' },
        ],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.officeHour.count({ where }),
    ]);
    return { items, total };
  }

  async create(user: CoreHubIdentity, dto: CreateOfficeHourDto, token: string): Promise<OfficeHour> {
    const { startMinute, endMinute, slotMinutes } = this.readTimes(dto);
    await this.assertNoOverlap(user.id, dto.dayOfWeek, startMinute, endMinute);

    // Personal data is never cached: asked now, with the teacher's own token.
    const teacherPersonCode = await this.people.myPersonCode(token);

    return this.prisma.officeHour.create({
      data: {
        teacherCoreUserId: user.id,
        teacherPersonCode,
        dayOfWeek: dto.dayOfWeek,
        startMinute,
        endMinute,
        slotMinutes,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  async update(user: CoreHubIdentity, id: string, dto: UpdateOfficeHourDto): Promise<OfficeHour> {
    const current = await this.loadEditable(user, id, Permission.OFFICE_HOUR_UPDATE_ANY);

    const merged = this.readTimes({
      startTime: dto.startTime ?? minutesToText(current.startMinute),
      endTime: dto.endTime ?? minutesToText(current.endMinute),
      slotMinutes: dto.slotMinutes ?? current.slotMinutes,
    });
    const dayOfWeek = dto.dayOfWeek ?? current.dayOfWeek;
    await this.assertNoOverlap(current.teacherCoreUserId, dayOfWeek, merged.startMinute, merged.endMinute, id);

    return this.prisma.officeHour.update({
      where: { id },
      data: {
        dayOfWeek,
        startMinute: merged.startMinute,
        endMinute: merged.endMinute,
        slotMinutes: merged.slotMinutes,
        isAvailable: dto.isAvailable ?? current.isAvailable,
      },
    });
  }

  async remove(user: CoreHubIdentity, id: string): Promise<{ id: string; deleted: true }> {
    await this.loadEditable(user, id, Permission.OFFICE_HOUR_DELETE_ANY);
    await this.prisma.officeHour.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** The row, if the caller may change it: their own, or any when they hold `anyPermission`. */
  private async loadEditable(
    user: CoreHubIdentity,
    id: string,
    anyPermission: Permission,
  ): Promise<OfficeHour> {
    const row = await this.prisma.officeHour.findUnique({ where: { id } });
    if (!row) {
      throw AppException.notFound('ไม่พบเวลาทำการนี้');
    }
    // Someone else's row is 403, never 404 (authorization 5): the caller is known.
    if (row.teacherCoreUserId !== user.id && !can(user.subsystemRole, anyPermission)) {
      throw AppException.forbidden('แก้ไขหรือลบได้เฉพาะเวลาทำการของตัวเอง');
    }
    return row;
  }

  private readTimes(input: {
    startTime: string;
    endTime: string;
    slotMinutes?: number;
  }): { startMinute: number; endMinute: number; slotMinutes: number } {
    const startMinute = parseTimeOfDay(input.startTime);
    const endMinute = parseTimeOfDay(input.endTime);
    if (startMinute === null || endMinute === null) {
      throw AppException.badRequest('เวลาต้องอยู่ในรูปแบบ HH:mm');
    }
    if (endMinute <= startMinute) {
      throw AppException.badRequest('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    }
    const slotMinutes = input.slotMinutes ?? DEFAULT_SLOT_MINUTES;
    if (endMinute - startMinute < slotMinutes) {
      throw AppException.badRequest('ช่วงเวลานี้สั้นกว่าความยาวของช่วงนัด 1 ช่วง');
    }
    return { startMinute, endMinute, slotMinutes };
  }

  /** Two rows of one teacher on one weekday must not share any minute. */
  private async assertNoOverlap(
    teacherCoreUserId: string,
    dayOfWeek: DayOfWeek,
    startMinute: number,
    endMinute: number,
    exceptId?: string,
  ): Promise<void> {
    const sameDay = await this.prisma.officeHour.findMany({ where: { teacherCoreUserId, dayOfWeek } });
    const clash = sameDay.find(
      (row) => row.id !== exceptId && row.startMinute < endMinute && startMinute < row.endMinute,
    );
    if (clash) {
      throw AppException.conflict('ช่วงเวลานี้ซ้อนกับเวลาทำการที่เปิดไว้แล้วในวันเดียวกัน', {
        officeHourId: clash.id,
      });
    }
  }
}

function minutesToText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
