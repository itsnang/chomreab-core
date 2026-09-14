import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
import {
  TELEGRAM_BOT_INFO_SERVICE,
  type ITelegramBotInfoService,
} from '../interfaces/telegram-bot-info.service';
import { UpdateSchoolSettingsCommand } from './update-school-settings.command';

@Injectable()
@CommandHandler(UpdateSchoolSettingsCommand)
export class UpdateSchoolSettingsHandler implements ICommandHandler<
  UpdateSchoolSettingsCommand,
  SchoolSettingsEntity
> {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    @Inject(TELEGRAM_BOT_INFO_SERVICE)
    private readonly telegramBotInfo: ITelegramBotInfoService,
  ) {}

  async execute(
    command: UpdateSchoolSettingsCommand,
  ): Promise<SchoolSettingsEntity> {
    // A blank `telegramBotToken` in the command means "not provided" (the
    // admin left the field empty to keep the current secret), never "clear
    // it" — so fall back to whatever is already saved, not null.
    // Treat null, undefined, and empty/whitespace strings as "not provided".
    const existing = await this.repository.findOneBy({
      id: SCHOOL_SETTINGS_ID,
    });
    const isTokenProvided =
      command.telegramBotToken && command.telegramBotToken.trim();
    const nextToken = isTokenProvided
      ? command.telegramBotToken
      : (existing?.telegramBotToken ?? null);

    // Re-check the bot's identity only when the token actually changed — a
    // save that leaves it untouched, or resubmits the same value, has
    // nothing new to learn from Telegram and shouldn't call out to it.
    let nextUsername = existing?.telegramBotUsername ?? null;
    if (isTokenProvided && nextToken !== existing?.telegramBotToken) {
      // `isTokenProvided` aliases the truthiness of `command.telegramBotToken`
      // itself (same narrowing the ternary above relies on), not `nextToken` —
      // which stays a `string | null` union to TS regardless of this branch.
      const fetched = await this.telegramBotInfo.getUsername(
        command.telegramBotToken,
      );
      // A failed lookup (bad token, network blip, Telegram outage) keeps
      // whatever was cached before, rather than blanking out a working
      // invite link over something transient.
      if (fetched !== null) nextUsername = fetched;
    }

    const settings = this.repository.create({
      id: SCHOOL_SETTINGS_ID,
      schoolName: command.schoolName,
      lateCutoffMinutes: command.lateCutoffMinutes,
      absenceMessageTemplate: command.absenceMessageTemplate,
      telegramBotToken: nextToken,
      telegramBotUsername: nextUsername,
    });
    return this.repository.save(settings);
  }
}
