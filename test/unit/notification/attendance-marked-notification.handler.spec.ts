import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceMarkedNotificationHandler } from '../../../src/notification/application/events/attendance-marked-notification.handler';
import { AttendanceMarkedEvent } from '../../../src/attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../src/parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';
import { SchoolSettingsService } from '../../../src/school-settings/application/services/school-settings.service';
import { TelegramApiError } from '../../../src/notification/infrastructure/services/telegram-api.error';

describe('AttendanceMarkedNotificationHandler', () => {
  let handler: AttendanceMarkedNotificationHandler;
  let parentLinkRepo: { find: jest.Mock; delete: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    parentLinkRepo = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
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
        {
          provide: SchoolSettingsService,
          useValue: {
            getEffectiveBotToken: jest.fn().mockResolvedValue('token'),
            getAbsenceTemplate: jest
              .fn()
              .mockResolvedValue('{{student_name}} was absent'),
          },
        },
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
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-2',
      expect.stringContaining('Sokha'),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-2',
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
    // A non-403 failure is transient (network blip, rate limit, ...) —
    // nothing here says the chat is actually gone, so the link stays.
    expect(parentLinkRepo.delete).not.toHaveBeenCalled();
  });

  it('unlinks a parent whose chat rejected delivery with 403', async () => {
    parentLinkRepo.find.mockResolvedValue([
      { studentId: 'student-1', telegramChatId: 'chat-1' },
      { studentId: 'student-1', telegramChatId: 'chat-2' },
    ]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    telegramService.sendMessage.mockImplementation((chatId: string) => {
      if (chatId === 'chat-1') {
        return Promise.reject(new TelegramApiError(403));
      }
      return Promise.resolve(undefined);
    });

    await handler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'present',
        null,
      ),
    );

    // 403 is Telegram's own confirmation the chat is gone (blocked, or the
    // bot was removed from a group) — only that link comes down.
    expect(parentLinkRepo.delete).toHaveBeenCalledTimes(1);
    expect(parentLinkRepo.delete).toHaveBeenCalledWith({
      studentId: 'student-1',
      telegramChatId: 'chat-1',
    });
    // The other parent's delivery, and their link, are untouched.
    expect(telegramService.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('substitutes {{note}} placeholder when note is present', async () => {
    const schoolSettings = {
      getEffectiveBotToken: jest.fn().mockResolvedValue('token'),
      getAbsenceTemplate: jest
        .fn()
        .mockResolvedValue('{{student_name}} was absent. Reason: {{note}}'),
    };

    const testModule = await Test.createTestingModule({
      providers: [
        AttendanceMarkedNotificationHandler,
        {
          provide: getRepositoryToken(ParentLinkEntity),
          useValue: parentLinkRepo,
        },
        {
          provide: getRepositoryToken(StudentEntity),
          useValue: studentRepo,
        },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
        { provide: SchoolSettingsService, useValue: schoolSettings },
      ],
    }).compile();

    const testHandler = testModule.get(AttendanceMarkedNotificationHandler);
    parentLinkRepo.find.mockResolvedValue([{ telegramChatId: 'chat-1' }]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await testHandler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'absent',
        'Doctor appointment',
      ),
    );

    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('Sokha'),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('Doctor appointment'),
    );
  });

  it('renders {{note}} as empty string when no note is provided', async () => {
    const schoolSettings = {
      getEffectiveBotToken: jest.fn().mockResolvedValue('token'),
      getAbsenceTemplate: jest
        .fn()
        .mockResolvedValue('{{student_name}} was absent{{note}}'),
    };

    const testModule = await Test.createTestingModule({
      providers: [
        AttendanceMarkedNotificationHandler,
        {
          provide: getRepositoryToken(ParentLinkEntity),
          useValue: parentLinkRepo,
        },
        {
          provide: getRepositoryToken(StudentEntity),
          useValue: studentRepo,
        },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
        { provide: SchoolSettingsService, useValue: schoolSettings },
      ],
    }).compile();

    const testHandler = testModule.get(AttendanceMarkedNotificationHandler);
    parentLinkRepo.find.mockResolvedValue([{ telegramChatId: 'chat-1' }]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await testHandler.handle(
      new AttendanceMarkedEvent(
        'student-1',
        'class-1',
        '2026-08-28',
        'absent',
        null,
      ),
    );

    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      'Sokha was absent',
    );
  });
});
