import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  DEFAULT_SCHOOL_SETTINGS,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';

@Injectable()
export class SchoolSettingsService {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    private readonly configService: ConfigService,
  ) {}

  /** The one bot token every School shares (ADR-0007) — no per-school
   *  override exists any more, so this is a plain config read, not a lookup. */
  getEffectiveBotToken(): string | undefined {
    return this.configService.get<string>('telegram.botToken');
  }

  /** The shared bot's @username, for building invite deep links. Also a
   *  config value now, for the same reason. */
  getBotUsername(): string | undefined {
    return this.configService.get<string>('telegram.botUsername');
  }

  /** The saved absence-notification template for one School, or the built-in
   *  default if that School has never saved settings. Supports a single
   *  `{{student_name}}` placeholder. */
  async getAbsenceTemplate(schoolId: string): Promise<string> {
    const settings = new ScopedRepository(this.repository, schoolId);
    const row = await settings.findOneBy({});
    return (
      row?.absenceMessageTemplate ??
      DEFAULT_SCHOOL_SETTINGS.absenceMessageTemplate
    );
  }
}
