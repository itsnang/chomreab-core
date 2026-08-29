import { Inject, Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceMarkedEvent } from '../../../attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
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
    const noteText = event.note ? `\nNote: ${event.note}` : '';
    const text = `${student?.name ?? 'Your child'} was marked ${label} on ${event.date}.${noteText}`;

    for (const link of links) {
      try {
        await this.telegram.sendMessage(link.telegramChatId, text);
      } catch {
        /* fire-and-forget, same as the rest of the notification module */
      }
    }
  }
}
