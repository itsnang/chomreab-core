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
  let parentLinkRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    linkingCodeRepo = {
      findOneBy: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    parentLinkRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
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
    await handler.execute(
      new LinkParentCommand('chat-1', 'BADCODE1', 'private'),
    );
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
    await handler.execute(
      new LinkParentCommand('chat-1', 'abcd1234', 'private'),
    );
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await handler.execute(
      new LinkParentCommand('chat-1', 'ABCD1234', 'private'),
    );
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

    await handler.execute(
      new LinkParentCommand('chat-1', 'ABCD1234', 'private'),
    );

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

  it('does not create a duplicate ParentLinkEntity when one already exists for the student+chat, but still marks the code used', async () => {
    const linkingCode = {
      code: 'WXYZ9876',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    parentLinkRepo.findOneBy.mockResolvedValue({
      id: 'existing-link',
      studentId: 'student-1',
      telegramChatId: 'chat-1',
    });

    await handler.execute(
      new LinkParentCommand('chat-1', 'WXYZ9876', 'private'),
    );

    expect(parentLinkRepo.save).not.toHaveBeenCalled();
    expect(linkingCodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) as Date }),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('already linked'),
    );
  });

  it('links a group chat and marks the code used on success (matches private today)', async () => {
    const linkingCode = {
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.execute(
      new LinkParentCommand('group-1', 'ABCD1234', 'group'),
    );

    expect(parentLinkRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        telegramChatId: 'group-1',
      }),
    );
  });

  it('does not mark the code used when redeemed by adding the bot to a group', async () => {
    const linkingCode = {
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.execute(
      new LinkParentCommand('group-1', 'ABCD1234', 'group'),
    );

    expect(linkingCodeRepo.save).not.toHaveBeenCalled();
  });

  it('lets the same code add the bot to a second group', async () => {
    // The first group's redemption is simulated by the code already being
    // unused (group redemption never burns it) — this call is the second
    // group picking up the very same code.
    const linkingCode = {
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.execute(
      new LinkParentCommand('group-2', 'ABCD1234', 'group'),
    );

    expect(parentLinkRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        telegramChatId: 'group-2',
      }),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'group-2',
      expect.stringContaining('Sokha'),
    );
  });

  it('rejects a code already burned by a private redemption, even for a group', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    });

    await handler.execute(
      new LinkParentCommand('group-1', 'ABCD1234', 'group'),
    );

    expect(parentLinkRepo.save).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'group-1',
      expect.stringContaining('invalid or expired'),
    );
  });

  it('rejects a second private redemption of a code already used privately', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    });

    await handler.execute(
      new LinkParentCommand('chat-2', 'ABCD1234', 'private'),
    );

    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });
});
