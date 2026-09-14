import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_SCHOOL_SETTINGS,
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';

@Injectable()
export class SchoolSettingsService {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    private readonly configService: ConfigService,
  ) {}

  /** The bot token to send Telegram messages with: the admin-configured
   *  override if one has been saved, otherwise the TELEGRAM_BOT_TOKEN env var. */
  async getEffectiveBotToken(): Promise<string | undefined> {
    const row = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    return (
      row?.telegramBotToken ??
      this.configService.get<string>('telegram.botToken')
    );
  }

  /** The bot's cached @username, for building invite deep links. Fetched via
   *  Telegram's `getMe` and cached by `UpdateSchoolSettingsHandler` whenever
   *  the token changes — never entered by an admin, and never fetched here. */
  async getBotUsername(): Promise<string | null> {
    const row = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    return row?.telegramBotUsername ?? null;
  }

  /** The saved absence-notification template, or the built-in default if
   *  settings have never been saved. Supports a single `{{student_name}}`
   *  placeholder. */
  async getAbsenceTemplate(): Promise<string> {
    const row = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    return (
      row?.absenceMessageTemplate ??
      DEFAULT_SCHOOL_SETTINGS.absenceMessageTemplate
    );
  }
}
