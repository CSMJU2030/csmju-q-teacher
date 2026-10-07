import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ApiEnvelope } from '../common/swagger/api-envelope';
import { parseUuid } from '../common/uuid.pipe';
import { ChatMessageResponse, toChatMessageResponse } from './chat-message.response';
import { ChatMessagesService } from './chat-messages.service';
import { CreateChatMessageDto, QueryChatMessagesDto } from './dto/chat-message.dto';

@ApiTags('chat-messages')
@Controller('v1/chat-messages')
export class ChatMessagesController {
  constructor(private readonly messages: ChatMessagesService) {}

  @Get()
  @RequirePermissions(Permission.CHAT_MESSAGE_READ_OWN)
  @ApiOperation({ summary: 'ข้อความในนัดหมายหนึ่งรายการ (เก่า → ใหม่)' })
  @ApiEnvelope(ChatMessageResponse, { collection: true })
  async findAll(@CurrentUser() user: CoreHubIdentity, @Query() query: QueryChatMessagesDto) {
    const { items, total } = await this.messages.findAll(user, query);
    return new CollectionResult(
      items.map(toChatMessageResponse),
      buildPaginationMeta(total, query.page ?? 1, query.take),
    );
  }

  @Post()
  @RequirePermissions(Permission.CHAT_MESSAGE_CREATE_OWN)
  @ApiOperation({ summary: 'ส่งข้อความในนัดหมายของตัวเอง' })
  @ApiEnvelope(ChatMessageResponse, { status: 201 })
  async create(@CurrentUser() user: CoreHubIdentity, @Body() dto: CreateChatMessageDto) {
    return toChatMessageResponse(await this.messages.create(user, dto));
  }

  @Patch(':id/read')
  @RequirePermissions(Permission.CHAT_MESSAGE_READ_OWN)
  @ApiOperation({ summary: 'ทำเครื่องหมายว่าอ่านข้อความแล้ว' })
  @ApiEnvelope(ChatMessageResponse)
  async markRead(@CurrentUser() user: CoreHubIdentity, @Param('id', parseUuid()) id: string) {
    return toChatMessageResponse(await this.messages.markRead(user, id));
  }
}
