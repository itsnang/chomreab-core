import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolSettingsEntity } from './infrastructure/entities/school-settings.entity';
import { SchoolSettingsController } from './api/controllers/school-settings.controller';
import { GetSchoolSettingsHandler } from './application/queries/get-school-settings.handler';
import { UpdateSchoolSettingsHandler } from './application/commands/update-school-settings.handler';
import { SchoolSettingsService } from './application/services/school-settings.service';
import { TELEGRAM_BOT_INFO_SERVICE } from './application/interfaces/telegram-bot-info.service';
import { TelegramBotInfoService } from './infrastructure/services/telegram-bot-info.service';

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
    SchoolSettingsService,
    { provide: TELEGRAM_BOT_INFO_SERVICE, useClass: TelegramBotInfoService },
  ],
  exports: [SchoolSettingsService],
})
export class SchoolSettingsModule {}
