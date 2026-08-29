import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkingCodeEntity } from '../../../parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import {
  TELEGRAM_SERVICE,
  type ITelegramService,
} from '../interfaces/telegram.service';
import { LinkParentCommand } from './link-parent.command';

@Injectable()
@CommandHandler(LinkParentCommand)
export class LinkParentHandler implements ICommandHandler<
  LinkParentCommand,
  void
> {
  constructor(
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  async execute(command: LinkParentCommand): Promise<void> {
    const { telegramChatId, code } = command;

    const linkingCode = await this.linkingCodeRepository.findOneBy({
      code: code.toUpperCase(),
    });
    if (
      !linkingCode ||
      linkingCode.usedAt !== null ||
      linkingCode.expiresAt.getTime() < Date.now()
    ) {
      await this.telegram.sendMessage(
        telegramChatId,
        'That code is invalid or expired. Ask your school for a new one.',
      );
      return;
    }

    const student = await this.studentRepository.findOneBy({
      id: linkingCode.studentId,
    });
    if (!student) {
      await this.telegram.sendMessage(
        telegramChatId,
        'That code is invalid or expired.',
      );
      return;
    }

    await this.parentLinkRepository.save({
      id: crypto.randomUUID(),
      studentId: student.id,
      telegramChatId,
    });
    linkingCode.usedAt = new Date();
    await this.linkingCodeRepository.save(linkingCode);

    await this.telegram.sendMessage(
      telegramChatId,
      `You're now linked to ${student.name}.`,
    );
  }
}
