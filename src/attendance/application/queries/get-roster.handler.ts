import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StudentEntity,
  StudentStatus,
} from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { GetRosterQuery } from './get-roster.query';

export interface RosterEntry {
  studentId: string;
  studentName: string;
  status: string | null;
  note: string | null;
}

@Injectable()
@QueryHandler(GetRosterQuery)
export class GetRosterHandler implements IQueryHandler<
  GetRosterQuery,
  RosterEntry[]
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetRosterQuery): Promise<RosterEntry[]> {
    // A deactivated student has left; they are off every roster from that
    // point on. Their past records stay, and stay readable.
    const students = await this.studentRepository.find({
      where: { classroomId: query.classroomId, status: StudentStatus.ACTIVE },
      order: { name: 'ASC' },
    });
    const records = await this.recordRepository.find({
      where: { classroomId: query.classroomId, date: query.date },
    });
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    return students.map((s) => {
      const record = byStudent.get(s.id);
      return {
        studentId: s.id,
        studentName: s.name,
        status: record?.status ?? null,
        note: record?.note ?? null,
      };
    });
  }
}
