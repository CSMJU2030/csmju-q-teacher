import { Booking, ChatMessage } from '../../generated/prisma/client';
import { CoreHubIdentity, SubsystemRole } from '../auth/core-hub-identity';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessagesService } from './chat-messages.service';

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
const stranger: CoreHubIdentity = { ...student, id: 'user-6704101399' };
const admin: CoreHubIdentity = {
  id: 'user-admin',
  email: 'admin@core.local',
  coreRole: 'admin',
  subsystemRole: SubsystemRole.ADMIN,
};

const BOOKING = '3f6f0f1e-6a5b-4c1c-9b53-1f0d7a8a1b11';

const booking = (): Booking => ({
  id: BOOKING,
  teacherCoreUserId: teacher.id,
  teacherPersonCode: null,
  studentCoreUserId: student.id,
  studentPersonCode: null,
  startsAt: new Date(),
  endsAt: new Date(),
  topic: 'ปรึกษา',
  status: 'CONFIRMED',
  closedByCoreUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const message = (patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm-1',
  bookingId: BOOKING,
  senderCoreUserId: teacher.id,
  message: 'สวัสดี',
  isRead: false,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...patch,
});

describe('ChatMessagesService', () => {
  let prisma: {
    booking: { findUnique: jest.Mock };
    chatMessage: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: ChatMessagesService;

  beforeEach(() => {
    prisma = {
      booking: { findUnique: jest.fn().mockResolvedValue(booking()) },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(message(data))),
        update: jest.fn(({ data }) => Promise.resolve(message(data))),
      },
    };
    service = new ChatMessagesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('stores the message under the sender from the token, unread', async () => {
      const created = await service.create(student, { bookingId: BOOKING, message: 'ขอเลื่อนนัดได้ไหม' });

      expect(created).toMatchObject({ senderCoreUserId: 'user-6704101312', isRead: false });
    });

    it('lets the teacher of the booking write too', async () => {
      await expect(service.create(teacher, { bookingId: BOOKING, message: 'ได้' })).resolves.toBeDefined();
    });

    it('answers 403 for someone who is neither the teacher nor the student of the booking', async () => {
      await expect(service.create(stranger, { bookingId: BOOKING, message: 'x' })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('answers 404 for a booking that does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.create(student, { bookingId: BOOKING, message: 'x' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('findAll', () => {
    it('reads the booking chat oldest first', async () => {
      await service.findAll(teacher, { bookingId: BOOKING, skip: 0, take: 20 } as never);

      expect(prisma.chatMessage.findMany.mock.calls[0][0]).toMatchObject({
        where: { bookingId: BOOKING },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('answers 403 for a stranger and also for an admin: the chat belongs to its two people', async () => {
      await expect(
        service.findAll(stranger, { bookingId: BOOKING, skip: 0, take: 20 } as never),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.findAll(admin, { bookingId: BOOKING, skip: 0, take: 20 } as never),
      ).rejects.toMatchObject({ status: 403 });
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('lets the other person mark a message read', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue(message());

      const read = await service.markRead(student, 'm-1');

      expect(read.isRead).toBe(true);
      expect(prisma.chatMessage.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { isRead: true } });
    });

    it('leaves your own message and an already read one alone', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue(message());
      await service.markRead(teacher, 'm-1');

      prisma.chatMessage.findUnique.mockResolvedValue(message({ isRead: true }));
      await service.markRead(student, 'm-1');

      expect(prisma.chatMessage.update).not.toHaveBeenCalled();
    });

    it('answers 403 for a stranger and 404 for a message that does not exist', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue(message());
      await expect(service.markRead(stranger, 'm-1')).rejects.toMatchObject({ status: 403 });

      prisma.chatMessage.findUnique.mockResolvedValue(null);
      await expect(service.markRead(student, 'm-9')).rejects.toMatchObject({ status: 404 });
    });
  });
});
