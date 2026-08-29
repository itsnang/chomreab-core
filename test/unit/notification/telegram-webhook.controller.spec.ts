import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { TelegramWebhookController } from '../../../src/notification/api/controllers/telegram-webhook.controller';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';

describe('TelegramWebhookController', () => {
  let controller: TelegramWebhookController;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  const buildModule = async () => {
    const module = await Test.createTestingModule({
      controllers: [TelegramWebhookController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
        { provide: ConfigService, useValue: configService },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    controller = module.get(TelegramWebhookController);
  };

  beforeEach(() => {
    commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    queryBus = { execute: jest.fn().mockResolvedValue('status') };
    configService = { getOrThrow: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  });

  it('rejects the request when no webhook secret is configured (fails closed)', async () => {
    configService.getOrThrow.mockImplementation(() => {
      throw new Error('TELEGRAM_WEBHOOK_SECRET is not defined');
    });
    await buildModule();

    await expect(controller.handleUpdate({}, 'anything')).rejects.toThrow(
      'TELEGRAM_WEBHOOK_SECRET is not defined',
    );
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('rejects a wrong-but-same-length secret header', async () => {
    configService.getOrThrow.mockReturnValue('correct-secret-value');
    await buildModule();

    await expect(
      controller.handleUpdate({}, 'wrong-secret-value!!'),
    ).rejects.toThrow(ForbiddenException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('rejects a missing secret header', async () => {
    configService.getOrThrow.mockReturnValue('correct-secret-value');
    await buildModule();

    await expect(controller.handleUpdate({}, undefined)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('accepts the request when the secret header matches', async () => {
    configService.getOrThrow.mockReturnValue('correct-secret-value');
    await buildModule();

    const result = await controller.handleUpdate({}, 'correct-secret-value');
    expect(result).toEqual({ ok: true });
  });

  it('processes the update once the secret header matches', async () => {
    configService.getOrThrow.mockReturnValue('correct-secret-value');
    await buildModule();

    const update = {
      message: { chat: { id: 42 }, text: '/link ABCD1234' },
    };
    await controller.handleUpdate(update, 'correct-secret-value');

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });
});
