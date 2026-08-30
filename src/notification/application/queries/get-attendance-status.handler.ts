import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../../attendance/infrastructure/entities/attendance-record.entity';
import { escapeTelegramHtml } from '../../../shared/utils/telegram-escape.util';
import { getSchoolToday } from '../../../shared/utils/school-date.util';
import { GetAttendanceStatusQuery } from './get-attendance-status.query';

@Injectable()
@QueryHandler(GetAttendanceStatusQuery)
export class GetAttendanceStatusHandler implements IQueryHandler<
  GetAttendanceStatusQuery,
  string
> {
  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetAttendanceStatusQuery): Promise<string> {
    const links = await this.parentLinkRepository.find({
      where: { telegramChatId: query.telegramChatId },
    });
    if (links.length === 0) {
      return "You haven't linked a child yet. Send /link <code> first.";
    }

    const today = getSchoolToday();
    const lines: string[] = [];
    for (const link of links) {
      const student = await this.studentRepository.findOneBy({
        id: link.studentId,
      });
      if (!student) continue;
      const record = await this.recordRepository.findOneBy({
        studentId: link.studentId,
        date: today,
      });
      lines.push(
        `${escapeTelegramHtml(student.name)}: ${record ? record.status : 'not marked yet'}`,
      );
    }
    return lines.join('\n');
  }
}
