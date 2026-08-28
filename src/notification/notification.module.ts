import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { NotificationController } from './api/controllers/notification.controller';
import { SendNotificationHandler } from './application/commands/send-notification.handler';
import { TELEGRAM_SERVICE } from './application/interfaces/telegram.service';
import { TelegramService } from './infrastructure/services/telegram.service';

@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [NotificationController],
  providers: [
    SendNotificationHandler,
    { provide: TELEGRAM_SERVICE, useClass: TelegramService },
  ],
  exports: [TELEGRAM_SERVICE],
})
export class NotificationModule {}
