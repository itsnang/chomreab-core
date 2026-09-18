import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
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
    // No schoolId on the query itself — same shape as link-parent.handler.ts.
    // A chat's links can span more than one School (one parent, two
    // institutions is ordinary here), so there is no single scope for this
    // whole query; each link is scoped by its own schoolId as it's read.
    const links = await this.parentLinkRepository.find({
      where: { telegramChatId: query.telegramChatId },
    });
    if (links.length === 0) {
      return "You haven't linked a child yet. Send /link <code> first.";
    }

    const today = getSchoolToday();
    const lines: string[] = [];
    for (const link of links) {
      const students = new ScopedRepository(
        this.studentRepository,
        link.schoolId,
      );
      const records = new ScopedRepository(
        this.recordRepository,
        link.schoolId,
      );
      const student = await students.findOneBy({ id: link.studentId });
      if (!student) continue;
      const record = await records.findOneBy({
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
