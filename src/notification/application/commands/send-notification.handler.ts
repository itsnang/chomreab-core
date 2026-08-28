import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  TELEGRAM_SERVICE,
  type ITelegramService,
} from '../interfaces/telegram.service';
import { SendNotificationCommand } from './send-notification.command';

@Injectable()
@CommandHandler(SendNotificationCommand)
export class SendNotificationHandler implements ICommandHandler<
  SendNotificationCommand,
  void
> {
  constructor(
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  async execute(command: SendNotificationCommand): Promise<void> {
    await this.telegram.sendMessage(command.chatId, command.message);
  }
}
