import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UpdateSchoolSettingsHandler } from '../../../src/school-settings/application/commands/update-school-settings.handler';
import { UpdateSchoolSettingsCommand } from '../../../src/school-settings/application/commands/update-school-settings.command';
import { TELEGRAM_BOT_ADMIN_SERVICE } from '../../../src/school-settings/application/interfaces/telegram-bot-admin.service';
import { SchoolSettingsEntity } from '../../../src/school-settings/infrastructure/entities/school-settings.entity';

const WEBHOOK_URL = 'https://school.example.com/telegram/webhook';
const SECRET = 'a'.repeat(64);
const OLD_TOKEN = '111:old-token';
const NEW_TOKEN = '222:new-token';

/** Only the fields this handler reads or writes; the row carries more. */
const savedSettings = (token: string | null, username: string | null) => ({
  id: 'default',
  schoolName: 'My School',
  lateCutoffMinutes: 15,
  absenceMessageTemplate: '{{student_name}} was absent.',
  telegramBotToken: token,
  telegramBotUsername: username,
});

const command = (token: string | null) =>
  new UpdateSchoolSettingsCommand(
    'My School',
    15,
    '{{student_name}} was absent.',
    token,
  );

describe('UpdateSchoolSettingsHandler', () => {
  let handler: UpdateSchoolSettingsHandler;
  let repo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let telegram: {
    getUsername: jest.Mock;
    setWebhook: jest.Mock;
    deleteWebhook: jest.Mock;
    getWebhookInfo: jest.Mock;
  };
  let config: Record<string, unknown>;

  const build = async () => {
    const module = await Test.createTestingModule({
      providers: [
        UpdateSchoolSettingsHandler,
        { provide: getRepositoryToken(SchoolSettingsEntity), useValue: repo },
        { provide: TELEGRAM_BOT_ADMIN_SERVICE, useValue: telegram },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => config[key],
            getOrThrow: (key: string) => {
              const value = config[key];
              if (value === undefined || value === null) {
                throw new Error(`Missing config: ${key}`);
              }
              return value;
            },
          },
        },
      ],
    }).compile();
    handler = module.get(UpdateSchoolSettingsHandler);
  };

  beforeEach(async () => {
    repo = {
      findOneBy: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
    };
    telegram = {
      getUsername: jest.fn().mockResolvedValue('schoolbot'),
      setWebhook: jest.fn().mockResolvedValue({ ok: true }),
      deleteWebhook: jest.fn().mockResolvedValue({ ok: true }),
      getWebhookInfo: jest.fn(),
    };
    config = {
      'telegram.webhookUrl': WEBHOOK_URL,
      'telegram.webhookSecret': SECRET,
    };
    await build();
  });

  it('leaves Telegram alone when the token is unchanged', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'schoolbot'));

    await handler.execute(command(OLD_TOKEN));

    expect(telegram.setWebhook).not.toHaveBeenCalled();
    expect(telegram.deleteWebhook).not.toHaveBeenCalled();
    expect(telegram.getUsername).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('leaves Telegram alone when no token is supplied at all', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'schoolbot'));

    await handler.execute(command(null));

    expect(telegram.setWebhook).not.toHaveBeenCalled();
    // The saved token survives a settings save that did not mention it.
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ telegramBotToken: OLD_TOKEN }),
    );
  });

  it('retires the old webhook, registers the new one, then saves', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));

    await handler.execute(command(NEW_TOKEN));

    expect(telegram.deleteWebhook).toHaveBeenCalledWith(OLD_TOKEN);
    expect(telegram.setWebhook).toHaveBeenCalledWith(
      NEW_TOKEN,
      WEBHOOK_URL,
      SECRET,
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotToken: NEW_TOKEN,
        telegramBotUsername: 'schoolbot',
      }),
    );
  });

  it('registers without retiring anything when this is the first token', async () => {
    repo.findOneBy.mockResolvedValue(null);

    await handler.execute(command(NEW_TOKEN));

    expect(telegram.deleteWebhook).not.toHaveBeenCalled();
    expect(telegram.setWebhook).toHaveBeenCalledWith(
      NEW_TOKEN,
      WEBHOOK_URL,
      SECRET,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects the save when Telegram refuses the token', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));
    telegram.setWebhook.mockResolvedValue({
      ok: false,
      reason: 'rejected',
      detail: 'Unauthorized',
    });

    await expect(handler.execute(command(NEW_TOKEN))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The whole point: a token that cannot receive updates is never persisted.
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects the save when Telegram cannot be reached', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));
    telegram.setWebhook.mockResolvedValue({
      ok: false,
      reason: 'unreachable',
      detail: 'socket hang up',
    });

    await expect(handler.execute(command(NEW_TOKEN))).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('carries on when retiring the old webhook fails', async () => {
    // The usual reason a token is being replaced is that it was revoked,
    // which makes deleting its webhook fail by definition.
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));
    telegram.deleteWebhook.mockResolvedValue({
      ok: false,
      reason: 'rejected',
      detail: 'Unauthorized',
    });

    await handler.execute(command(NEW_TOKEN));

    expect(telegram.setWebhook).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('skips registration when the deployment has no public URL', async () => {
    config['telegram.webhookUrl'] = null;
    await build();
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));

    await handler.execute(command(NEW_TOKEN));

    expect(telegram.setWebhook).not.toHaveBeenCalled();
    expect(telegram.deleteWebhook).not.toHaveBeenCalled();
    // Local development still saves, and still refreshes the username.
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ telegramBotToken: NEW_TOKEN }),
    );
  });

  it('keeps the cached username when the lookup fails', async () => {
    repo.findOneBy.mockResolvedValue(savedSettings(OLD_TOKEN, 'oldbot'));
    telegram.getUsername.mockResolvedValue(null);

    await handler.execute(command(NEW_TOKEN));

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ telegramBotUsername: 'oldbot' }),
    );
  });
});
