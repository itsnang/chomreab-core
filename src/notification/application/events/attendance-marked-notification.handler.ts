import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceMarkedEvent } from '../../../attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { escapeTelegramHtml } from '../../../shared/utils/telegram-escape.util';
import { SchoolSettingsService } from '../../../school-settings/application/services/school-settings.service';
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
    private readonly schoolSettings: SchoolSettingsService,
  ) {}

  async handle(event: AttendanceMarkedEvent): Promise<void> {
    const links = await this.parentLinkRepository.find({
      where: { studentId: event.studentId },
    });
    if (links.length === 0) return;

    const student = await this.studentRepository.findOneBy({
      id: event.studentId,
    });
    const studentName = escapeTelegramHtml(student?.name ?? 'Your child');
    const text = await this.buildMessage(event, studentName);

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

  private async buildMessage(
    event: AttendanceMarkedEvent,
    studentName: string,
  ): Promise<string> {
    if (event.status === 'absent') {
      // Escape the admin-authored template's own literal text once, then
      // substitute the already-escaped student name and note into their placeholders —
      // never re-escape studentName or note, or entities like `&amp;` double-encode.
      const template = await this.schoolSettings.getAbsenceTemplate();
      const escapedTemplate = escapeTelegramHtml(template);
      const escapedNote = event.note ? escapeTelegramHtml(event.note) : '';
      return escapedTemplate
        .replace(/\{\{\s*student_name\s*\}\}/g, studentName)
        .replace(/\{\{\s*note\s*\}\}/g, escapedNote);
    }
    const label = STATUS_LABEL[event.status] ?? event.status;
    const noteText = event.note
      ? `\nNote: ${escapeTelegramHtml(event.note)}`
      : '';
    return `${studentName} was marked ${label} on ${event.date}.${noteText}`;
  }
}
