import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
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
    const settings = this.repository.create({
      id: SCHOOL_SETTINGS_ID,
      schoolName: command.schoolName,
      lateCutoffMinutes: command.lateCutoffMinutes,
      absenceMessageTemplate: command.absenceMessageTemplate,
      telegramBotToken: isTokenProvided
        ? command.telegramBotToken
        : (existing?.telegramBotToken ?? null),
    });
    return this.repository.save(settings);
  }
}
