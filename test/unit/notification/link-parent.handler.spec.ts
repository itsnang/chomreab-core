import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LinkParentHandler } from '../../../src/notification/application/commands/link-parent.handler';
import { LinkParentCommand } from '../../../src/notification/application/commands/link-parent.command';
import { LinkingCodeEntity } from '../../../src/parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../../src/parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';

describe('LinkParentHandler', () => {
  let handler: LinkParentHandler;
  let linkingCodeRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let parentLinkRepo: { save: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    linkingCodeRepo = {
      findOneBy: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    parentLinkRepo = { save: jest.fn().mockResolvedValue(undefined) };
    studentRepo = { findOneBy: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        LinkParentHandler,
        {
          provide: getRepositoryToken(LinkingCodeEntity),
          useValue: linkingCodeRepo,
        },
        {
          provide: getRepositoryToken(ParentLinkEntity),
          useValue: parentLinkRepo,
        },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    handler = module.get(LinkParentHandler);
  });

  it('rejects an unknown code without creating a link', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue(null);
    await handler.execute(new LinkParentCommand('chat-1', 'BADCODE1'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('invalid or expired'),
    );
  });

  it('rejects an already-used code', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    });
    await handler.execute(new LinkParentCommand('chat-1', 'abcd1234'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await handler.execute(new LinkParentCommand('chat-1', 'ABCD1234'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });

  it('links the parent and marks the code used on success', async () => {
    const linkingCode = {
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.execute(new LinkParentCommand('chat-1', 'ABCD1234'));

    expect(parentLinkRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        telegramChatId: 'chat-1',
      }),
    );
    expect(linkingCodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) as Date }),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('Sokha'),
    );
  });
});
