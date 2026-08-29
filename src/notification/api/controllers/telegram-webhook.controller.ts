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
import { ApiExcludeController } from '@nestjs/swagger';
import {
  TELEGRAM_SERVICE,
  type ITelegramService,
} from '../../application/interfaces/telegram.service';
import { LinkParentCommand } from '../../application/commands/link-parent.command';
import { GetAttendanceStatusQuery } from '../../application/queries/get-attendance-status.query';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
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
    const expectedSecret = this.configService.get<string>(
      'telegram.webhookSecret',
    );
    if (expectedSecret && secretHeader !== expectedSecret) {
      throw new ForbiddenException();
    }

    const chatId = update.message?.chat.id.toString();
    const text = update.message?.text?.trim();
    if (!chatId || !text) {
      return { ok: true };
    }

    if (text === '/start') {
      await this.telegram.sendMessage(
        chatId,
        "Welcome! Ask your school for a linking code, then send /link <code> to connect your child's attendance.",
      );
    } else if (text.startsWith('/link')) {
      const code = text.split(/\s+/)[1];
      if (!code) {
        await this.telegram.sendMessage(chatId, 'Usage: /link <code>');
      } else {
        await this.commandBus.execute(new LinkParentCommand(chatId, code));
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
