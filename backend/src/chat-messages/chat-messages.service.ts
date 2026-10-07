import { Injectable } from '@nestjs/common';
import { Booking, ChatMessage } from '../../generated/prisma/client';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatMessageDto, QueryChatMessagesDto } from './dto/chat-message.dto';

/**
 * The chat of one booking. Only its two people - the teacher and the student -
 * read and write it: "own" here means the booking's `teacherCoreUserId` or
 * `studentCoreUserId` equals the token's `sub`. Not even an admin reads it.
 */
@Injectable()
export class ChatMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: CoreHubIdentity,
    query: QueryChatMessagesDto,
  ): Promise<{ items: ChatMessage[]; total: number }> {
    await this.loadParticipantBooking(user, query.bookingId);

    const where = { bookingId: query.bookingId };
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);
    return { items, total };
  }

  async create(user: CoreHubIdentity, dto: CreateChatMessageDto): Promise<ChatMessage> {
    await this.loadParticipantBooking(user, dto.bookingId);

    return this.prisma.chatMessage.create({
      data: {
        bookingId: dto.bookingId,
        senderCoreUserId: user.id,
        message: dto.message,
        isRead: false,
      },
    });
  }

  /** The other person marks a message read. Your own message needs no mark and is returned as it is. */
  async markRead(user: CoreHubIdentity, id: string): Promise<ChatMessage> {
    const message = await this.prisma.chatMessage.findUnique({ where: { id } });
    if (!message) {
      throw AppException.notFound('ไม่พบข้อความนี้');
    }
    await this.loadParticipantBooking(user, message.bookingId);

    if (message.senderCoreUserId === user.id || message.isRead) {
      return message;
    }
    return this.prisma.chatMessage.update({ where: { id }, data: { isRead: true } });
  }

  private async loadParticipantBooking(user: CoreHubIdentity, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw AppException.notFound('ไม่พบนัดหมายนี้');
    }
    // Someone else's chat is 403, never 404 (authorization 5).
    if (booking.teacherCoreUserId !== user.id && booking.studentCoreUserId !== user.id) {
      throw AppException.forbidden('อ่านและส่งข้อความได้เฉพาะคู่สนทนาของนัดหมายนี้');
    }
    return booking;
  }
}
