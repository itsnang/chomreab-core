import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../attendance/infrastructure/entities/attendance-record.entity';
import { GetReportsSummaryQuery } from './get-reports-summary.query';

const WINDOW_DAYS = 20;
const CHRONIC_ABSENCE_THRESHOLD = 3;

export interface StudentReportRow {
  studentId: string;
  studentName: string;
  classroomName: string;
  present: number;
  late: number;
  absent: number;
  ratePct: number;
  chronic: boolean;
}

export interface ClassDailySummary {
  classroomId: string;
  classroomName: string;
  present: number;
  late: number;
  absent: number;
  unmarked: number;
}

export interface ReportsSummary {
  overallRatePct: number;
  chronicCount: number;
  dailySummary: ClassDailySummary[];
  studentRows: StudentReportRow[];
}

function windowStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (WINDOW_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

@Injectable()
@QueryHandler(GetReportsSummaryQuery)
export class GetReportsSummaryHandler implements IQueryHandler<
  GetReportsSummaryQuery,
  ReportsSummary
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetReportsSummaryQuery): Promise<ReportsSummary> {
    const { today } = query;
    const start = windowStart(today);

    const [students, classrooms, windowRecords] = await Promise.all([
      this.studentRepository.find(),
      this.classroomRepository.find(),
      this.recordRepository.find({ where: { date: Between(start, today) } }),
    ]);

    const classroomById = new Map(classrooms.map((c) => [c.id, c]));

    const studentRows: StudentReportRow[] = students.map((s) => {
      const records = windowRecords.filter((r) => r.studentId === s.id);
      const present = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT,
      ).length;
      const late = records.filter(
        (r) => r.status === AttendanceStatus.LATE,
      ).length;
      const absent = records.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      const totalMarked = present + late + absent;
      const ratePct =
        totalMarked === 0
          ? 100
          : Math.round(((present + late) / totalMarked) * 100);
      return {
        studentId: s.id,
        studentName: s.name,
        classroomName: classroomById.get(s.classroomId)?.name ?? 'Unassigned',
        present,
        late,
        absent,
        ratePct,
        chronic: absent >= CHRONIC_ABSENCE_THRESHOLD,
      };
    });

    const overallRatePct =
      studentRows.length === 0
        ? 100
        : Math.round(
            studentRows.reduce((sum, r) => sum + r.ratePct, 0) /
              studentRows.length,
          );
    const chronicCount = studentRows.filter((r) => r.chronic).length;

    const todayRecords = windowRecords.filter((r) => r.date === today);
    const dailySummary: ClassDailySummary[] = classrooms.map((c) => {
      const roster = students.filter((s) => s.classroomId === c.id);
      const records = todayRecords.filter((r) => r.classroomId === c.id);
      const present = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT,
      ).length;
      const late = records.filter(
        (r) => r.status === AttendanceStatus.LATE,
      ).length;
      const absent = records.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      return {
        classroomId: c.id,
        classroomName: c.name,
        present,
        late,
        absent,
        unmarked: roster.length - present - late - absent,
      };
    });

    return { overallRatePct, chronicCount, dailySummary, studentRows };
  }
}
