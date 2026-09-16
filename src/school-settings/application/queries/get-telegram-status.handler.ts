import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
import {
  TELEGRAM_BOT_ADMIN_SERVICE,
  type ITelegramBotAdminService,
} from '../interfaces/telegram-bot-admin.service';
import { GetTelegramStatusQuery } from './get-telegram-status.query';

export interface TelegramStatus {
  status:
    | 'ok'
    | 'pointed_elsewhere'
    | 'not_registered'
    | 'no_token'
    | 'unreachable';
  detail: string | null;
  expectedUrl: string | null;
  actualUrl: string | null;
}

@Injectable()
@QueryHandler(GetTelegramStatusQuery)
export class GetTelegramStatusHandler implements IQueryHandler<
  GetTelegramStatusQuery,
  TelegramStatus
> {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    @Inject(TELEGRAM_BOT_ADMIN_SERVICE)
    private readonly telegramBotAdmin: ITelegramBotAdminService,
    private readonly configService: ConfigService,
  ) {}

  async execute(): Promise<TelegramStatus> {
    const expectedUrl =
      this.configService.get<string>('telegram.webhookUrl') ?? null;

    const settings = await this.repository.findOneBy({
      id: SCHOOL_SETTINGS_ID,
    });
    const token = settings?.telegramBotToken ?? null;
    if (!token) {
      return {
        status: 'no_token',
        detail: 'No bot token has been saved yet.',
        expectedUrl,
        actualUrl: null,
      };
    }

    const info = await this.telegramBotAdmin.getWebhookInfo(token);
    if (!info.ok) {
      // A refusal here means Telegram would not answer *about* the webhook —
      // almost always a revoked or mistyped token. It shares the 'unreachable'
      // verdict with a genuine outage because from the admin's side both mean
      // "we could not find out"; `detail` carries Telegram's own words.
      return {
        status: 'unreachable',
        detail: info.detail,
        expectedUrl,
        actualUrl: null,
      };
    }

    // Telegram reports an unregistered webhook as an empty string.
    if (info.url === '') {
      return {
        status: 'not_registered',
        detail:
          info.lastErrorMessage ??
          'This bot has no webhook, so parents cannot link.',
        expectedUrl,
        actualUrl: null,
      };
    }

    if (expectedUrl === null) {
      // Local development: a webhook exists but this deployment has no public
      // URL to compare it against, so it cannot claim the registration is its
      // own. Reporting 'ok' here would be a guess.
      return {
        status: 'pointed_elsewhere',
        detail:
          'This deployment has no public URL configured, so it cannot own a webhook.',
        expectedUrl,
        actualUrl: info.url,
      };
    }

    if (info.url !== expectedUrl) {
      return {
        status: 'pointed_elsewhere',
        detail:
          info.lastErrorMessage ??
          'Updates are being delivered to a different server.',
        expectedUrl,
        actualUrl: info.url,
      };
    }

    return {
      status: 'ok',
      detail: info.lastErrorMessage,
      expectedUrl,
      actualUrl: info.url,
    };
  }
}
