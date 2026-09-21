import { randomInt } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../infrastructure/entities/linking-code.entity';
import { GenerateLinkingCodeCommand } from './generate-linking-code.command';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 7;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  }
  return code;
}

@Injectable()
@CommandHandler(GenerateLinkingCodeCommand)
export class GenerateLinkingCodeHandler implements ICommandHandler<
  GenerateLinkingCodeCommand,
  LinkingCodeEntity
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
  ) {}

  async execute(
    command: GenerateLinkingCodeCommand,
  ): Promise<LinkingCodeEntity> {
    const students = new ScopedRepository(
      this.studentRepository,
      command.schoolId,
    );
    // `code` stays globally unique across every School (linking-code.entity.ts),
    // so this write is the one deliberate exception that does not go through
    // ScopedRepository — everything else about the row is still scoped.
    const student = await students.findOneBy({ id: command.studentId });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const linkingCode = this.linkingCodeRepository.create({
      id: crypto.randomUUID(),
      schoolId: command.schoolId,
      studentId: command.studentId,
      code: generateCode(),
      expiresAt,
      usedAt: null,
    });
    // eslint-disable-next-line local/require-scoped-repository -- schoolId set explicitly above, from command.schoolId; see docs/adr/0010
    return this.linkingCodeRepository.save(linkingCode);
  }
}
