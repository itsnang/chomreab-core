import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceMarkedEvent } from '../../../attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { escapeTelegramHtml } from '../../../shared/utils/telegram-escape.util';
import {
  TELEGRAM_SERVICE,
  type ITelegramService,
} from '../interfaces/telegram.service';

const STATUS_LABEL: Record<string, string> = {
  present: '✅ present',
  absent: '❌ absent',
  late: '⏰ late',
};

@Injectable()
@EventsHandler(AttendanceMarkedEvent)
export class AttendanceMarkedNotificationHandler implements IEventHandler<AttendanceMarkedEvent> {
  private readonly logger = new Logger(
    AttendanceMarkedNotificationHandler.name,
  );

  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  async handle(event: AttendanceMarkedEvent): Promise<void> {
    const links = await this.parentLinkRepository.find({
      where: { studentId: event.studentId },
    });
    if (links.length === 0) return;

    const student = await this.studentRepository.findOneBy({
      id: event.studentId,
    });
    const label = STATUS_LABEL[event.status] ?? event.status;
    const studentName = escapeTelegramHtml(student?.name ?? 'Your child');
    const noteText = event.note
      ? `\nNote: ${escapeTelegramHtml(event.note)}`
      : '';
    const text = `${studentName} was marked ${label} on ${event.date}.${noteText}`;

    for (const link of links) {
      try {
        await this.telegram.sendMessage(link.telegramChatId, text);
      } catch (error) {
        // Fire-and-forget: one parent's failed delivery shouldn't stop the
        // rest, but it must still be observable rather than silently lost.
        this.logger.error(
          `Failed to send attendance notification to chat ${link.telegramChatId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
