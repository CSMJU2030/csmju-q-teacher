import { Booking, OfficeHour } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from './schedule.service';

const teacher: CoreHubIdentity = {
  id: 'user-lect-1',
  email: 'lecturer@core.local',
  coreRole: 'lecturer',
  subsystemRole: SubsystemRole.TEACHER,
};
const student: CoreHubIdentity = {
  id: 'user-6704101312',
  email: 'student@core.local',
  coreRole: 'student',
  subsystemRole: SubsystemRole.STUDENT,
};
const otherStudent: CoreHubIdentity = { ...student, id: 'user-6704101399' };

/** 2026-10-05 is a Monday; 09:00 Bangkok is 02:00 UTC. */
const MON = '2026-10-05';

const monday9to11: OfficeHour = {
  id: 'oh-1',
  teacherCoreUserId: teacher.id,
  teacherPersonCode: 'somchai.p',
  dayOfWeek: 'MON',
  startMinute: 540,
  endMinute: 660,
  slotMinutes: 30,
  isAvailable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const booking = (patch: Partial<Booking> = {}): Booking => ({
  id: 'b-1',
  teacherCoreUserId: teacher.id,
  teacherPersonCode: 'somchai.p',
  studentCoreUserId: student.id,
  studentPersonCode: '6704101312',
  startsAt: new Date('2026-10-05T02:30:00.000Z'),
  endsAt: new Date('2026-10-05T03:00:00.000Z'),
  topic: 'ปรึกษาโครงงาน',
  status: 'CONFIRMED',
  closedByCoreUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});

describe('ScheduleService', () => {
  let prisma: {
    officeHour: { findMany: jest.Mock };
    bookingException: { findMany: jest.Mock };
    booking: { findMany: jest.Mock };
  };
  let service: ScheduleService;

  beforeEach(() => {
    prisma = {
      officeHour: { findMany: jest.fn().mockResolvedValue([monday9to11]) },
      bookingException: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([booking()]) },
    };
    service = new ScheduleService(prisma as unknown as PrismaService);
  });

  const query = (patch: Record<string, unknown> = {}) =>
    ({ teacherCoreUserId: teacher.id, weekStart: MON, page: 1, limit: 100, skip: 0, take: 100, ...patch }) as never;

  it('lists the week of that teacher as slots, oldest first', async () => {
    const { items, total } = await service.findSlots(student, query());

    expect(total).toBe(4);
    expect(items.map((slot) => slot.startsAt)).toEqual([
      '2026-10-05T02:00:00.000Z',
      '2026-10-05T02:30:00.000Z',
      '2026-10-05T03:00:00.000Z',
      '2026-10-05T03:30:00.000Z',
    ]);
    expect(items.map((slot) => slot.status)).toEqual(['AVAILABLE', 'BOOKED', 'AVAILABLE', 'AVAILABLE']);
  });

  it('asks only for that teacher and that week', async () => {
    await service.findSlots(student, query({ weekStart: '2026-10-07' }));

    const { where } = prisma.booking.findMany.mock.calls[0][0];
    expect(where.teacherCoreUserId).toBe('user-lect-1');
    expect(where.startsAt.lt.toISOString()).toBe('2026-10-09T17:00:00.000Z'); // Saturday 00:00 Bangkok
    expect(where.endsAt.gt.toISOString()).toBe('2026-10-04T17:00:00.000Z'); // Monday 00:00 Bangkok
  });

  it('shows the teacher who booked each slot', async () => {
    const { items } = await service.findSlots(teacher, query());

    expect(items[1].booking).toEqual({
      id: 'b-1',
      studentPersonCode: '6704101312',
      topic: 'ปรึกษาโครงงาน',
      status: 'CONFIRMED',
    });
  });

  it('tells a student only that the slot is taken, and whether it is theirs', async () => {
    const mine = await service.findSlots(student, query());
    expect(mine.items[1]).toMatchObject({ status: 'BOOKED', bookedByMe: true, booking: null });

    const others = await service.findSlots(otherStudent, query());
    expect(others.items[1]).toMatchObject({ status: 'BOOKED', bookedByMe: false, booking: null });
  });

  it('shows a teacher their own schedule when they name nobody', async () => {
    await service.findSlots(teacher, query({ teacherCoreUserId: undefined }));

    expect(prisma.officeHour.findMany.mock.calls[0][0].where).toEqual({ teacherCoreUserId: 'user-lect-1' });
  });

  it('answers 400 when a student names no teacher or gives a date that does not exist', async () => {
    await expect(service.findSlots(student, query({ teacherCoreUserId: undefined }))).rejects.toMatchObject({ status: 400 });
    await expect(service.findSlots(student, query({ weekStart: '2026-13-45' }))).rejects.toMatchObject({ status: 400 });
  });

  it('pages the slots of the week', async () => {
    const { items, total } = await service.findSlots(student, query({ page: 2, limit: 3, skip: 3, take: 3 }));

    expect(total).toBe(4);
    expect(items).toHaveLength(1);
  });
});
