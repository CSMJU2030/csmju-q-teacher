import { ApiProperty } from '@nestjs/swagger';
import { ChatMessage } from '../../generated/prisma/client';

/** One message between the teacher and the student of a booking. */
export class ChatMessageResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({
    description: 'ค่า sub ของผู้ส่ง — เทียบกับ id จาก GET /api/v1/me เพื่อรู้ว่าเป็นข้อความของเราหรือไม่',
  })
  senderCoreUserId!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export function toChatMessageResponse(row: ChatMessage): ChatMessageResponse {
  return {
    id: row.id,
    bookingId: row.bookingId,
    senderCoreUserId: row.senderCoreUserId,
    message: row.message,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}
