import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
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
import { RegisterTelegramWebhookCommand } from './register-telegram-webhook.command';

/**
 * Registers the webhook for the bot token already saved, on demand.
 *
 * This exists because the save-triggered path has a dead end: a token saved
 * while no public URL was configured is skipped, and re-saving the same token
 * will not retry, because the trigger compares values and nothing changed. It
 * is also the recovery route when a webhook has been repointed by hand — a
 * local tunnel claiming it back, say — without needing a redeploy.
 *
 * Nothing is retired here: there is no previous token in this flow, only the
 * current one being re-pointed at this deployment.
 */
@Injectable()
@CommandHandler(RegisterTelegramWebhookCommand)
export class RegisterTelegramWebhookHandler implements ICommandHandler<
  RegisterTelegramWebhookCommand,
  { registeredUrl: string }
> {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    @Inject(TELEGRAM_BOT_ADMIN_SERVICE)
    private readonly telegramBotAdmin: ITelegramBotAdminService,
    private readonly configService: ConfigService,
  ) {}

  async execute(): Promise<{ registeredUrl: string }> {
    const webhookUrl = this.configService.get<string>('telegram.webhookUrl');
    if (!webhookUrl) {
      throw new UnprocessableEntityException(
        'This deployment has no public URL, so Telegram has nowhere to deliver updates.',
      );
    }

    const settings = await this.repository.findOneBy({
      id: SCHOOL_SETTINGS_ID,
    });
    const token = settings?.telegramBotToken ?? null;
    if (!token) {
      throw new UnprocessableEntityException(
        'Save a bot token before connecting it to Telegram.',
      );
    }

    const secret = this.configService.getOrThrow<string>(
      'telegram.webhookSecret',
    );
    const registered = await this.telegramBotAdmin.setWebhook(
      token,
      webhookUrl,
      secret,
    );

    if (registered.ok) return { registeredUrl: webhookUrl };

    if (registered.reason === 'rejected') {
      throw new BadRequestException(
        `Telegram rejected the saved bot token (${registered.detail}). Save a valid token from BotFather first.`,
      );
    }
    throw new BadGatewayException(
      `Could not reach Telegram (${registered.detail}). Try again.`,
    );
  }
}
