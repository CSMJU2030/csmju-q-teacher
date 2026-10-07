import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Who sends comes from the verified token, never from the body - ValidationPipe's
 * forbidNonWhitelisted rejects a smuggled senderCoreUserId.
 */
export class CreateChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'bookingId ต้องเป็น UUID' })
  bookingId!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000, example: 'สวัสดี ขอเลื่อนนัดได้ไหม' })
  @IsString({ message: 'message ต้องเป็นข้อความ' })
  @Length(1, 1000, { message: 'message ต้องยาว 1-1000 ตัวอักษร' })
  message!: string;
}

export class QueryChatMessagesDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'นัดหมายที่ต้องการอ่านข้อความ' })
  @IsUUID('4', { message: 'bookingId ต้องเป็น UUID' })
  bookingId!: string;
}
