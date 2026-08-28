import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GenerateLinkingCodeHandler } from '../../../src/parent-link/application/commands/generate-linking-code.handler';
import { GenerateLinkingCodeCommand } from '../../../src/parent-link/application/commands/generate-linking-code.command';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../../src/parent-link/infrastructure/entities/linking-code.entity';

describe('GenerateLinkingCodeHandler', () => {
  let handler: GenerateLinkingCodeHandler;
  let studentRepo: { findOneBy: jest.Mock };
  let linkingCodeRepo: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    studentRepo = { findOneBy: jest.fn() };
    linkingCodeRepo = {
      create: jest.fn(
        (v: Partial<LinkingCodeEntity>) => v as LinkingCodeEntity,
      ),
      save: jest.fn((v: LinkingCodeEntity) => Promise.resolve(v)),
    };

    const module = await Test.createTestingModule({
      providers: [
        GenerateLinkingCodeHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        {
          provide: getRepositoryToken(LinkingCodeEntity),
          useValue: linkingCodeRepo,
        },
      ],
    }).compile();

    handler = module.get(GenerateLinkingCodeHandler);
  });

  it('throws NotFoundException when the student does not exist', async () => {
    studentRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(new GenerateLinkingCodeCommand('missing')),
    ).rejects.toThrow(NotFoundException);
  });

  it('generates an 8-character code expiring 7 days out', async () => {
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    const before = Date.now();

    const result = await handler.execute(
      new GenerateLinkingCodeCommand('student-1'),
    );

    expect(result.studentId).toBe('student-1');
    expect(result.code).toHaveLength(8);
    expect(result.usedAt).toBeNull();
    const expiresInMs = result.expiresAt.getTime() - before;
    expect(expiresInMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);
  });
});
