import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  TELEGRAM_SERVICE,
  type ITelegramService,
} from '../../application/interfaces/telegram.service';
import { LinkParentCommand } from '../../application/commands/link-parent.command';
import { MigrateGroupChatCommand } from '../../application/commands/migrate-group-chat.command';
import { GetAttendanceStatusQuery } from '../../application/queries/get-attendance-status.query';

interface TelegramUpdate {
  message?: {
    chat: { id: number; type?: string };
    text?: string;
    /** Present on the message Telegram sends immediately after a group is
     *  upgraded to a supergroup, carrying the group's new id. */
    migrate_to_chat_id?: number;
  };
}

/** A `/start` deep link (`t.me/bot?start=CODE`) reaches the webhook as
 *  `/start CODE`; a `?startgroup=CODE` link, once the parent picks a group,
 *  reaches it as `/start@<bot_username> CODE`. Both forms — with or without
 *  the bot mention, with or without a payload — are one command. */
const START_COMMAND = /^\/start(?:@\S+)?(?:\s+(\S+))?$/;

/** Telegram's own vocabulary for the chat kinds this webhook cares about;
 *  everything else (a channel post, a missing field on an odd payload)
 *  collapses to the more conservative 'private' behaviour. */
function chatTypeOf(rawType: string | undefined): 'private' | 'group' {
  return rawType === 'group' || rawType === 'supergroup' ? 'group' : 'private';
}

@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  @HttpCode(200)
  @Post('webhook')
  async handleUpdate(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token')
    secretHeader: string | undefined,
  ): Promise<{ ok: true }> {
    const expectedSecret = this.configService.getOrThrow<string>(
      'telegram.webhookSecret',
    );
    const expectedBuffer = Buffer.from(expectedSecret);
    const actualBuffer = Buffer.from(secretHeader ?? '');
    const isValid =
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      throw new ForbiddenException();
    }

    const chatId = update.message?.chat.id.toString();
    if (!chatId) {
      return { ok: true };
    }

    // A migration service message carries no `text` at all, so it has to be
    // caught before the text-based branching below (which would otherwise
    // drop it on the `!text` check right after this).
    const migrateToChatId = update.message?.migrate_to_chat_id;
    if (migrateToChatId !== undefined) {
      await this.commandBus.execute(
        new MigrateGroupChatCommand(chatId, migrateToChatId.toString()),
      );
      return { ok: true };
    }

    const text = update.message?.text?.trim();
    if (!text) {
      return { ok: true };
    }

    const chatType = chatTypeOf(update.message?.chat.type);
    const startMatch = START_COMMAND.exec(text);

    if (startMatch) {
      const payload = startMatch[1];
      if (!payload) {
        await this.telegram.sendMessage(
          chatId,
          "Welcome! Ask your school for a linking code, then send /link <code> to connect your child's attendance.",
        );
      } else {
        await this.commandBus.execute(
          new LinkParentCommand(chatId, payload, chatType),
        );
      }
    } else if (text.startsWith('/link')) {
      const code = text.split(/\s+/)[1];
      if (!code) {
        await this.telegram.sendMessage(chatId, 'Usage: /link <code>');
      } else {
        await this.commandBus.execute(
          new LinkParentCommand(chatId, code, chatType),
        );
      }
    } else if (text === '/status') {
      const message = await this.queryBus.execute<
        GetAttendanceStatusQuery,
        string
      >(new GetAttendanceStatusQuery(chatId));
      await this.telegram.sendMessage(chatId, message);
    } else {
      await this.telegram.sendMessage(chatId, 'Unknown command. Try /status.');
    }

    return { ok: true };
  }
}
