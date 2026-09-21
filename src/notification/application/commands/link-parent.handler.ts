import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { LinkingCodeEntity } from '../../../parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { escapeTelegramHtml } from '../../../shared/utils/telegram-escape.util';
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
    const { telegramChatId, code, chatType } = command;

    // The one deliberate unscoped lookup in the whole codebase: a parent's
    // /link CODE carries no school identifier, and with one shared bot there
    // is no per-request "current school" the way a per-school bot token used
    // to imply one. `code` stays globally unique (linking-code.entity.ts)
    // specifically so this resolves unambiguously. Everything downstream —
    // once linkingCode.schoolId is known — re-enters ScopedRepository
    // discipline immediately.
    // eslint-disable-next-line local/require-scoped-repository -- unscoped by design, see comment above and docs/adr/0010
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

    const students = new ScopedRepository(
      this.studentRepository,
      linkingCode.schoolId,
    );
    const parentLinks = new ScopedRepository(
      this.parentLinkRepository,
      linkingCode.schoolId,
    );

    const student = await students.findOneBy({ id: linkingCode.studentId });
    if (!student) {
      await this.telegram.sendMessage(
        telegramChatId,
        'That code is invalid or expired.',
      );
      return;
    }

    const existingLink = await parentLinks.findOneBy({
      studentId: student.id,
      telegramChatId,
    });

    if (!existingLink) {
      await parentLinks.save({
        id: crypto.randomUUID(),
        studentId: student.id,
        telegramChatId,
      });
    }

    // A private redemption burns the code, exactly as before. Adding the bot
    // to a group does not: the same code may add it to a second family group,
    // or re-add it after an accidental removal, until it expires on its own.
    if (chatType === 'private') {
      linkingCode.usedAt = new Date();
      // eslint-disable-next-line local/require-scoped-repository -- mutating the same already-resolved row above; see docs/adr/0010
      await this.linkingCodeRepository.save(linkingCode);
    }

    const safeName = escapeTelegramHtml(student.name);
    await this.telegram.sendMessage(
      telegramChatId,
      existingLink
        ? `You're already linked to ${safeName}.`
        : `You're now linked to ${safeName}.`,
    );
  }
}
