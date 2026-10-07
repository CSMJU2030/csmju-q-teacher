import { BookingException } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { PrismaService } from '../prisma/prisma.service';
import { BookingExceptionsService } from './booking-exceptions.service';

const teacher: CoreHubIdentity = {
  id: 'user-lect-1',
  email: 'lecturer@core.local',
  coreRole: 'lecturer',
  subsystemRole: SubsystemRole.TEACHER,
};
const otherTeacher: CoreHubIdentity = { ...teacher, id: 'user-lect-2' };
const admin: CoreHubIdentity = {
  id: 'user-admin',
  email: 'admin@core.local',
  coreRole: 'admin',
  subsystemRole: SubsystemRole.ADMIN,
};

const row = (patch: Partial<BookingException> = {}): BookingException => ({
  id: 'ex-1',
  teacherCoreUserId: teacher.id,
  startsAt: new Date('2026-10-05T05:00:00.000Z'),
  endsAt: new Date('2026-10-05T06:00:00.000Z'),
  status: 'AVAILABLE',
  reason: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...patch,
});

describe('BookingExceptionsService', () => {
  let prisma: {
    bookingException: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    booking: { findFirst: jest.Mock };
  };
  let service: BookingExceptionsService;

  beforeEach(() => {
    prisma = {
      bookingException: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        delete: jest.fn().mockResolvedValue(row()),
      },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new BookingExceptionsService(prisma as unknown as PrismaService);
  });

  const valid = (patch: Record<string, unknown> = {}) => ({
    startsAt: '2026-10-05T12:00:00+07:00',
    endsAt: '2026-10-05T13:00:00+07:00',
    status: 'AVAILABLE' as const,
    ...patch,
  });

  describe('create', () => {
    it('stores the exception for the caller from the token', async () => {
      const created = await service.create(teacher, valid({ reason: 'เปิดคาบพิเศษ' }));

      expect(created.teacherCoreUserId).toBe('user-lect-1');
      expect(created.startsAt.toISOString()).toBe('2026-10-05T05:00:00.000Z');
      expect(created.reason).toBe('เปิดคาบพิเศษ');
    });

    it('rejects an end that is not after the start with 400', async () => {
      await expect(
        service.create(teacher, valid({ endsAt: '2026-10-05T12:00:00+07:00' })),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a window longer than 24 hours with 400', async () => {
      await expect(
        service.create(teacher, valid({ endsAt: '2026-10-07T12:00:00+07:00' })),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('answers 409 when closing a time that still holds a confirmed booking', async () => {
      prisma.booking.findFirst.mockResolvedValue({ id: 'b-1' });

      await expect(service.create(teacher, valid({ status: 'UNAVAILABLE' }))).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
      });
      expect(prisma.bookingException.create).not.toHaveBeenCalled();
    });

    it('does not look for bookings when opening a time', async () => {
      await service.create(teacher, valid());

      expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('shows a teacher their own exceptions when they name nobody', async () => {
      await service.findAll(teacher, { skip: 0, take: 20 } as never);

      expect(prisma.bookingException.findMany.mock.calls[0][0].where.teacherCoreUserId).toBe('user-lect-1');
    });

    it('turns from/to Bangkok dates into an overlap window', async () => {
      await service.findAll(teacher, { from: '2026-10-05', to: '2026-10-09', skip: 0, take: 20 } as never);

      const { where } = prisma.bookingException.findMany.mock.calls[0][0];
      expect(where.endsAt.gt.toISOString()).toBe('2026-10-04T17:00:00.000Z');
      expect(where.startsAt.lt.toISOString()).toBe('2026-10-09T17:00:00.000Z');
    });
  });

  describe('remove', () => {
    it("answers 403, not 404, for another teacher's exception", async () => {
      prisma.bookingException.findUnique.mockResolvedValue(row());

      await expect(service.remove(otherTeacher, 'ex-1')).rejects.toMatchObject({ status: 403 });
      expect(prisma.bookingException.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for an id that does not exist', async () => {
      prisma.bookingException.findUnique.mockResolvedValue(null);

      await expect(service.remove(teacher, 'ex-9')).rejects.toMatchObject({ status: 404 });
    });

    it('lets the owner and an admin delete, answering { id, deleted: true }', async () => {
      prisma.bookingException.findUnique.mockResolvedValue(row());

      await expect(service.remove(teacher, 'ex-1')).resolves.toEqual({ id: 'ex-1', deleted: true });
      await expect(service.remove(admin, 'ex-1')).resolves.toEqual({ id: 'ex-1', deleted: true });
    });
  });
});
