import { Test } from '@nestjs/testing';
import { SendNotificationHandler } from '../../../src/notification/application/commands/send-notification.handler';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';
import { SendNotificationCommand } from '../../../src/notification/application/commands/send-notification.command';

describe('SendNotificationHandler', () => {
  let handler: SendNotificationHandler;
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    telegramService = { sendMessage: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SendNotificationHandler,
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    handler = module.get(SendNotificationHandler);
  });

  it('calls sendMessage with the chat id and message', async () => {
    telegramService.sendMessage.mockResolvedValue(undefined);
    const command = new SendNotificationCommand('chat-1', 'Hello, world!');

    await handler.execute(command);

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      'Hello, world!',
    );
  });

  it('propagates error when sendMessage throws', async () => {
    const error = new Error('Telegram API error');
    telegramService.sendMessage.mockRejectedValue(error);
    const command = new SendNotificationCommand('chat-1', 'Test message');

    await expect(handler.execute(command)).rejects.toThrow(
      'Telegram API error',
    );
  });
});
