import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../parent-link/infrastructure/entities/parent-link.entity';
import { AttendanceRecordEntity } from '../attendance/infrastructure/entities/attendance-record.entity';
import { NotificationController } from './api/controllers/notification.controller';
import { TelegramWebhookController } from './api/controllers/telegram-webhook.controller';
import { SendNotificationHandler } from './application/commands/send-notification.handler';
import { LinkParentHandler } from './application/commands/link-parent.handler';
import { MigrateGroupChatHandler } from './application/commands/migrate-group-chat.handler';
import { GetAttendanceStatusHandler } from './application/queries/get-attendance-status.handler';
import { AttendanceMarkedNotificationHandler } from './application/events/attendance-marked-notification.handler';
import { TELEGRAM_SERVICE } from './application/interfaces/telegram.service';
import { TelegramService } from './infrastructure/services/telegram.service';
import { SchoolSettingsModule } from '../school-settings/school-settings.module';

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      StudentEntity,
      LinkingCodeEntity,
      ParentLinkEntity,
      AttendanceRecordEntity,
    ]),
    SchoolSettingsModule,
  ],
  controllers: [NotificationController, TelegramWebhookController],
  providers: [
    SendNotificationHandler,
    LinkParentHandler,
    MigrateGroupChatHandler,
    GetAttendanceStatusHandler,
    AttendanceMarkedNotificationHandler,
    { provide: TELEGRAM_SERVICE, useClass: TelegramService },
  ],
  exports: [TELEGRAM_SERVICE],
})
export class NotificationModule {}
