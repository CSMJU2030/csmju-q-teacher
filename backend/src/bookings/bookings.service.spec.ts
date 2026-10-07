import { Booking } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { AppException } from '../common/errors';
import { PeopleService, PersonSummary } from '../core-hub/people.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingSort } from './dto/booking.dto';
import { BookingsService } from './bookings.service';

const teacher: CoreHubIdentity = {
  id: 'user-lect-1',
  email: 'lecturer@core.local',
  coreRole: 'lecturer',
  subsystemRole: SubsystemRole.TEACHER,
};
const otherTeacher: CoreHubIdentity = { ...teacher, id: 'user-lect-2' };
const student: CoreHubIdentity = {
  id: 'user-6704101312',
  email: 'student@core.local',
  coreRole: 'student',
  subsystemRole: SubsystemRole.STUDENT,
};
const otherStudent: CoreHubIdentity = { ...student, id: 'user-6704101399' };
const admin: CoreHubIdentity = {
  id: 'user-admin',
  email: 'admin@core.local',
  coreRole: 'admin',
  subsystemRole: SubsystemRole.ADMIN,
};

const TOKEN = 'caller-token';
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const person: PersonSummary = {
  personCode: '6704101312',
  personType: 'STUDENT',
  fullNameTh: 'นักศึกษา ทดสอบ',
  coreUserId: student.id,
};

const stored = (patch: Partial<Booking> = {}): Booking => ({
  id: 'b-1',
  teacherCoreUserId: teacher.id,
  teacherPersonCode: 'somchai.p',
  studentCoreUserId: student.id,
  studentPersonCode: '6704101312',
  startsAt: new Date(Date.now() + 24 * 3_600_000),
  endsAt: new Date(Date.now() + 25 * 3_600_000),
  topic: 'ปรึกษาโครงงาน',
  status: 'CONFIRMED',
  closedByCoreUserId: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...patch,
});

describe('BookingsService', () => {
  let prisma: {
    booking: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    chatMessage: { findMany: jest.Mock };
  };
  let people: { myPersonCode: jest.Mock; findByPersonCode: jest.Mock };
  let service: BookingsService;

  beforeEach(() => {
    prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(stored(data))),
        update: jest.fn(({ data }) => Promise.resolve(stored(data))),
      },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    people = {
      myPersonCode: jest.fn().mockResolvedValue('somchai.p'),
      findByPersonCode: jest.fn().mockResolvedValue(person),
    };
    service = new BookingsService(prisma as unknown as PrismaService, people as unknown as PeopleService);
  });

  const valid = () => ({
    studentPersonCode: '6704101312',
    startsAt: inHours(24),
    endsAt: inHours(25),
    topic: 'ปรึกษาโครงงาน',
  });

  describe('create (the teacher puts a student into their own queue)', () => {
    it('creates a CONFIRMED booking for the teacher from the token and the student Core Hub names', async () => {
      const { booking, studentFullNameTh } = await service.create(teacher, valid(), TOKEN);

      expect(booking).toMatchObject({
        teacherCoreUserId: 'user-lect-1',
        teacherPersonCode: 'somchai.p',
        studentCoreUserId: 'user-6704101312',
        studentPersonCode: '6704101312',
        status: 'CONFIRMED',
      });
      expect(studentFullNameTh).toBe('นักศึกษา ทดสอบ');
    });

    it('keeps no name or email: only Core Hub ids go into the table', async () => {
      await service.create(teacher, valid(), TOKEN);

      const data = prisma.booking.create.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual([
        'endsAt',
        'startsAt',
        'status',
        'studentCoreUserId',
        'studentPersonCode',
        'teacherCoreUserId',
        'teacherPersonCode',
        'topic',
      ]);
    });

    it('looks the student up with the teacher token, never from a cache', async () => {
      await service.create(teacher, valid(), TOKEN);

      expect(people.findByPersonCode).toHaveBeenCalledWith('6704101312', TOKEN);
      expect(people.myPersonCode).toHaveBeenCalledWith(TOKEN);
    });

    it('rejects an end that is not after the start, a booking over 4 hours and one in the past with 400', async () => {
      await expect(service.create(teacher, { ...valid(), endsAt: valid().startsAt }, TOKEN)).rejects.toMatchObject({ status: 400 });
      await expect(service.create(teacher, { ...valid(), endsAt: inHours(30) }, TOKEN)).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create(teacher, { ...valid(), startsAt: inHours(-3), endsAt: inHours(-2) }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(people.findByPersonCode).not.toHaveBeenCalled();
    });

    it('answers 409 when the teacher already has an appointment at that time', async () => {
      prisma.booking.findFirst.mockResolvedValueOnce(stored());

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
      });
      expect(people.findByPersonCode).not.toHaveBeenCalled();
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('answers 409 when the student already has an appointment at that time', async () => {
      prisma.booking.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(stored());

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 409 });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('answers 400 for a code Core Hub does not know and for a code that is not a student', async () => {
      people.findByPersonCode.mockResolvedValueOnce(null);
      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 400 });

      people.findByPersonCode.mockResolvedValueOnce({ ...person, personType: 'STAFF' });
      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 400 });
    });

    it('answers 409 for a student who has no account yet', async () => {
      people.findByPersonCode.mockResolvedValueOnce({ ...person, coreUserId: null });

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 409 });
    });

    it('does not let a teacher book themselves', async () => {
      people.findByPersonCode.mockResolvedValueOnce({ ...person, coreUserId: teacher.id });

      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 400 });
    });

    it('passes on Core Hub ending the session (401) and being unavailable (503)', async () => {
      people.findByPersonCode.mockRejectedValueOnce(AppException.unauthorized('session over'));
      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 401 });

      people.findByPersonCode.mockRejectedValueOnce(AppException.serviceUnavailable('down', 30));
      await expect(service.create(teacher, valid(), TOKEN)).rejects.toMatchObject({ status: 503 });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('shows a teacher the bookings they run', async () => {
      await service.findAll(teacher, { skip: 0, take: 20 } as never);

      expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({ teacherCoreUserId: 'user-lect-1' });
    });

    it('shows a student only their own bookings', async () => {
      await service.findAll(student, { skip: 0, take: 20 } as never);

      expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({ studentCoreUserId: 'user-6704101312' });
    });

    it('shows an admin every booking', async () => {
      await service.findAll(admin, { skip: 0, take: 20 } as never);

      const { where } = prisma.booking.findMany.mock.calls[0][0];
      expect(where).not.toHaveProperty('teacherCoreUserId');
      expect(where).not.toHaveProperty('studentCoreUserId');
    });

    it('sorts on the server', async () => {
      await service.findAll(student, { sort: BookingSort.CREATED_AT_DESC, skip: 0, take: 20 } as never);

      expect(prisma.booking.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    });

    it('counts only the unread messages the other person sent', async () => {
      prisma.booking.findMany.mockResolvedValue([stored()]);
      prisma.chatMessage.findMany.mockResolvedValue([
        { bookingId: 'b-1', senderCoreUserId: teacher.id, isRead: false },
        { bookingId: 'b-1', senderCoreUserId: teacher.id, isRead: false },
        { bookingId: 'b-1', senderCoreUserId: student.id, isRead: false },
      ]);

      const { items } = await service.findAll(student, { skip: 0, take: 20 } as never);

      expect(items[0].unreadCount).toBe(2);
    });
  });

  describe('findOne', () => {
    it("answers 403, not 404, for someone else's booking", async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      await expect(service.findOne(otherStudent, 'b-1', TOKEN)).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      await expect(service.findOne(otherTeacher, 'b-1', TOKEN)).rejects.toMatchObject({ status: 403 });
    });

    it('answers 404 for an id that does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.findOne(teacher, 'b-9', TOKEN)).rejects.toMatchObject({ status: 404 });
    });

    it('gives the teacher the student name from Core Hub, and the student none', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      expect((await service.findOne(teacher, 'b-1', TOKEN)).studentFullNameTh).toBe('นักศึกษา ทดสอบ');
      people.findByPersonCode.mockClear();
      expect((await service.findOne(student, 'b-1', TOKEN)).studentFullNameTh).toBeNull();
      expect(people.findByPersonCode).not.toHaveBeenCalled();
    });

    it('still opens the booking when Core Hub cannot give a name', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());
      people.findByPersonCode.mockRejectedValueOnce(AppException.serviceUnavailable('down', 30));

      await expect(service.findOne(teacher, 'b-1', TOKEN)).resolves.toMatchObject({ studentFullNameTh: null });
    });

    it('lets a Core Hub 401 through, so the user signs in again', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());
      people.findByPersonCode.mockRejectedValueOnce(AppException.unauthorized('session over'));

      await expect(service.findOne(teacher, 'b-1', TOKEN)).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('cancel and complete', () => {
    it('lets the teacher of the booking cancel or complete it, recording who did', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      await service.cancel(teacher, 'b-1');
      expect(prisma.booking.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED', closedByCoreUserId: 'user-lect-1' });

      await service.complete(teacher, 'b-1');
      expect(prisma.booking.update.mock.calls[1][0].data).toEqual({ status: 'COMPLETED', closedByCoreUserId: 'user-lect-1' });
    });

    it('answers 403 when the student of the booking tries to close it', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      await expect(service.cancel(student, 'b-1')).rejects.toMatchObject({ status: 403 });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("answers 403 when another teacher tries to close someone else's booking", async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      await expect(service.complete(otherTeacher, 'b-1')).rejects.toMatchObject({ status: 403 });
    });

    it('lets an admin close anyone', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored());

      await expect(service.cancel(admin, 'b-1')).resolves.toBeDefined();
    });

    it('answers 409 for a booking that is no longer confirmed', async () => {
      prisma.booking.findUnique.mockResolvedValue(stored({ status: 'CANCELLED' }));

      await expect(service.cancel(teacher, 'b-1')).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });
});
