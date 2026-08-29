import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceMarkedNotificationHandler } from '../../../src/notification/application/events/attendance-marked-notification.handler';
import { AttendanceMarkedEvent } from '../../../src/attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../src/parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';

describe('AttendanceMarkedNotificationHandler', () => {
  let handler: AttendanceMarkedNotificationHandler;
  let parentLinkRepo: { find: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    parentLinkRepo = { find: jest.fn() };
    studentRepo = { findOneBy: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AttendanceMarkedNotificationHandler,
        {
          provide: getRepositoryToken(ParentLinkEntity),
          useValue: parentLinkRepo,
        },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    handler = module.get(AttendanceMarkedNotificationHandler);
  });

  it('does nothing when the student has no linked parents', async () => {
    parentLinkRepo.find.mockResolvedValue([]);
    await handler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'present',
        null,
      ),
    );
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a message to every linked parent chat', async () => {
    parentLinkRepo.find.mockResolvedValue([
      { telegramChatId: 'chat-1' },
      { telegramChatId: 'chat-2' },
    ]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'absent',
        'Sick',
      ),
    );

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(2);
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('Sokha'),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('absent'),
    );
  });

  it('does not let one failed send stop the others', async () => {
    parentLinkRepo.find.mockResolvedValue([
      { telegramChatId: 'chat-1' },
      { telegramChatId: 'chat-2' },
    ]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    telegramService.sendMessage.mockRejectedValueOnce(
      new Error('Telegram API error'),
    );

    await handler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'late',
        null,
      ),
    );

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(2);
  });
});
