import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../infrastructure/entities/linking-code.entity';
import { GenerateLinkingCodeCommand } from './generate-linking-code.command';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 7;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
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
    const student = await this.studentRepository.findOneBy({
      id: command.studentId,
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const linkingCode = this.linkingCodeRepository.create({
      id: crypto.randomUUID(),
      studentId: command.studentId,
      code: generateCode(),
      expiresAt,
      usedAt: null,
    });
    return this.linkingCodeRepository.save(linkingCode);
  }
}
