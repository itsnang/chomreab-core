import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolSettingsEntity } from './infrastructure/entities/school-settings.entity';
import { SchoolSettingsController } from './api/controllers/school-settings.controller';
import { GetSchoolSettingsHandler } from './application/queries/get-school-settings.handler';
import { UpdateSchoolSettingsHandler } from './application/commands/update-school-settings.handler';
import { GetTelegramStatusHandler } from './application/queries/get-telegram-status.handler';
import { RegisterTelegramWebhookHandler } from './application/commands/register-telegram-webhook.handler';
import { SchoolSettingsService } from './application/services/school-settings.service';
import { TELEGRAM_BOT_ADMIN_SERVICE } from './application/interfaces/telegram-bot-admin.service';
import { TelegramBotAdminService } from './infrastructure/services/telegram-bot-admin.service';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([SchoolSettingsEntity]),
    JwtModule.register({}),
  ],
  controllers: [SchoolSettingsController],
  providers: [
    GetSchoolSettingsHandler,
    UpdateSchoolSettingsHandler,
    GetTelegramStatusHandler,
    RegisterTelegramWebhookHandler,
    SchoolSettingsService,
    { provide: TELEGRAM_BOT_ADMIN_SERVICE, useClass: TelegramBotAdminService },
  ],
  exports: [SchoolSettingsService],
})
export class SchoolSettingsModule {}
