import { OfficeHour } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { AppException } from '../common/errors';
import { PeopleService } from '../core-hub/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeHoursService } from './office-hours.service';

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
const TOKEN = 'caller-token';

const row = (patch: Partial<OfficeHour> = {}): OfficeHour => ({
  id: 'oh-1',
  teacherCoreUserId: teacher.id,
  teacherPersonCode: 'somchai.p',
  dayOfWeek: 'MON',
  startMinute: 9 * 60,
  endMinute: 12 * 60,
  slotMinutes: 30,
  isAvailable: true,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...patch,
});

describe('OfficeHoursService', () => {
  let prisma: {
    officeHour: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let people: { myPersonCode: jest.Mock };
  let service: OfficeHoursService;

  beforeEach(() => {
    prisma = {
      officeHour: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        update: jest.fn(({ data }) => Promise.resolve(row(data))),
        delete: jest.fn().mockResolvedValue(row()),
      },
    };
    people = { myPersonCode: jest.fn().mockResolvedValue('somchai.p') };
    service = new OfficeHoursService(
      prisma as unknown as PrismaService,
      people as unknown as PeopleService,
    );
  });

  const valid = () => ({ dayOfWeek: 'MON' as const, startTime: '09:00', endTime: '12:00' });

  describe('create', () => {
    it('stores office hours for the caller from the token, as minutes after midnight', async () => {
      const created = await service.create(teacher, valid(), TOKEN);

      expect(created).toMatchObject({
        teacherCoreUserId: 'user-lect-1',
        teacherPersonCode: 'somchai.p',
        startMinute: 540,
        endMinute: 720,
        slotMinutes: 30,
        isAvailable: true,
      });
      expect(people.myPersonCode).toHaveBeenCalledWith(TOKEN);
    });

    it('rejects an end time that is not after the start time with 400', async () => {
      await expect(
        service.create(teacher, { ...valid(), startTime: '12:00', endTime: '09:00' }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.officeHour.create).not.toHaveBeenCalled();
    });

    it('rejects a window shorter than one slot with 400', async () => {
      await expect(
        service.create(teacher, { ...valid(), startTime: '09:00', endTime: '09:20' }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('answers 409 when it overlaps office hours the teacher already has that day', async () => {
      prisma.officeHour.findMany.mockResolvedValue([row({ startMinute: 11 * 60, endMinute: 13 * 60 })]);

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
      });
      expect(prisma.officeHour.create).not.toHaveBeenCalled();
    });

    it('allows back-to-back office hours (one ends where the next starts)', async () => {
      prisma.officeHour.findMany.mockResolvedValue([row({ startMinute: 12 * 60, endMinute: 15 * 60 })]);

      await expect(service.create(teacher, valid(), TOKEN)).resolves.toBeDefined();
    });

    it('does not store anything when Core Hub has ended the session', async () => {
      people.myPersonCode.mockRejectedValueOnce(AppException.unauthorized('session over'));

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 401 });
      expect(prisma.officeHour.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('shows a teacher their own office hours when they name nobody', async () => {
      await service.findAll(teacher, { skip: 0, take: 20 } as never);

      expect(prisma.officeHour.findMany.mock.calls[0][0].where).toEqual({ teacherCoreUserId: 'user-lect-1' });
    });

    it('lets anyone look at a named teacher', async () => {
      await service.findAll(teacher, { teacherCoreUserId: 'user-lect-2', skip: 0, take: 20 } as never);

      expect(prisma.officeHour.findMany.mock.calls[0][0].where).toEqual({ teacherCoreUserId: 'user-lect-2' });
    });
  });

  describe('update and remove', () => {
    it("answers 403, not 404, for another teacher's office hours", async () => {
      prisma.officeHour.findUnique.mockResolvedValue(row());

      await expect(service.update(otherTeacher, 'oh-1', { startTime: '10:00' })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      await expect(service.remove(otherTeacher, 'oh-1')).rejects.toMatchObject({ status: 403 });
      expect(prisma.officeHour.update).not.toHaveBeenCalled();
      expect(prisma.officeHour.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for an id that does not exist', async () => {
      prisma.officeHour.findUnique.mockResolvedValue(null);

      await expect(service.remove(teacher, 'oh-9')).rejects.toMatchObject({ status: 404 });
    });

    it('lets the owner change their own, ignoring the row itself in the overlap check', async () => {
      prisma.officeHour.findUnique.mockResolvedValue(row());
      prisma.officeHour.findMany.mockResolvedValue([row()]);

      const updated = await service.update(teacher, 'oh-1', { endTime: '13:00' });

      expect(updated.endMinute).toBe(13 * 60);
    });

    it('lets an admin change anyone', async () => {
      prisma.officeHour.findUnique.mockResolvedValue(row());

      await expect(service.update(admin, 'oh-1', { slotMinutes: 15 })).resolves.toBeDefined();
    });

    it('answers a successful delete with { id, deleted: true }', async () => {
      prisma.officeHour.findUnique.mockResolvedValue(row());

      await expect(service.remove(teacher, 'oh-1')).resolves.toEqual({ id: 'oh-1', deleted: true });
    });
  });
});
