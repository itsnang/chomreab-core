import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
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
import { UpdateSchoolSettingsCommand } from './update-school-settings.command';

@Injectable()
@CommandHandler(UpdateSchoolSettingsCommand)
export class UpdateSchoolSettingsHandler implements ICommandHandler<
  UpdateSchoolSettingsCommand,
  SchoolSettingsEntity
> {
  private readonly logger = new Logger(UpdateSchoolSettingsHandler.name);

  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    @Inject(TELEGRAM_BOT_ADMIN_SERVICE)
    private readonly telegramBotAdmin: ITelegramBotAdminService,
    private readonly configService: ConfigService,
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

    let nextUsername = existing?.telegramBotUsername ?? null;

    // Only a token that actually changed has anything to do with Telegram — a
    // save that leaves it untouched, or resubmits the same value, has nothing
    // new to learn and no reason to re-register.
    if (isTokenProvided && nextToken !== existing?.telegramBotToken) {
      // `isTokenProvided` aliases the truthiness of `command.telegramBotToken`
      // itself (same narrowing the ternary above relies on), not `nextToken` —
      // which stays a `string | null` union to TS regardless of this branch.
      const token = command.telegramBotToken;

      // Registration happens before the write, not after. That is what makes
      // "a rejected token is never saved" true without a rollback, and it
      // avoids holding a transaction open across a call to Telegram that has
      // been observed to take over four seconds.
      await this.registerWebhook(token, existing?.telegramBotToken ?? null);

      const fetched = await this.telegramBotAdmin.getUsername(token);
      // A failed lookup (network blip, Telegram outage) keeps whatever was
      // cached before, rather than blanking out a working invite link. Unlike
      // the registration above, nothing depends on this succeeding.
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

  /** Points the new bot's updates at this deployment, and retires the old
   *  bot's webhook on the way. Throws rather than returning, so a caller
   *  cannot accidentally persist a token that cannot receive anything. */
  private async registerWebhook(
    token: string,
    previousToken: string | null,
  ): Promise<void> {
    const webhookUrl = this.configService.get<string>('telegram.webhookUrl');
    if (!webhookUrl) {
      // No public URL resolved: this is a developer's machine, where
      // `scripts/tunnel.sh` owns the webhook. Saving still succeeds.
      this.logger.log(
        'No public URL configured — skipping Telegram webhook registration.',
      );
      return;
    }

    // Guaranteed present: configuration refuses to boot with a public URL and
    // no secret, because a webhook registered without one fails every update.
    const secret = this.configService.getOrThrow<string>(
      'telegram.webhookSecret',
    );

    if (previousToken) {
      const retired = await this.telegramBotAdmin.deleteWebhook(previousToken);
      if (!retired.ok) {
        // Expected whenever the old token was revoked, which is the usual
        // reason for replacing it. Never a reason to block the new bot.
        this.logger.warn(
          `Could not retire the previous bot's webhook: ${retired.detail}`,
        );
      }
    }

    const registered = await this.telegramBotAdmin.setWebhook(
      token,
      webhookUrl,
      secret,
    );
    if (registered.ok) return;

    if (registered.reason === 'rejected') {
      throw new BadRequestException(
        `Telegram rejected this bot token (${registered.detail}). Check the token from BotFather and try again.`,
      );
    }
    throw new BadGatewayException(
      `Could not reach Telegram to connect this bot (${registered.detail}). The token was not saved — try again.`,
    );
  }
}
