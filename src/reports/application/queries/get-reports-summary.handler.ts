import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  StudentEntity,
  StudentStatus,
} from '../../../student/infrastructure/entities/student.entity';
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
  /** Rows are per student *per classroom*, so studentId alone is not unique. */
  classroomId: string;
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
      // Students who have left are kept: their attendance in the window really
      // happened, and dropping them would rewrite history.
      this.studentRepository.find(),
      this.classroomRepository.find(),
      this.recordRepository.find({ where: { date: Between(start, today) } }),
    ]);

    const classroomById = new Map(classrooms.map((c) => [c.id, c]));
    const classroomName = (id: string) =>
      classroomById.get(id)?.name ?? 'Unassigned';

    const tally = (records: AttendanceRecordEntity[]) => {
      const present = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT,
      ).length;
      const late = records.filter(
        (r) => r.status === AttendanceStatus.LATE,
      ).length;
      const absent = records.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      return { present, late, absent };
    };

    const rate = (present: number, late: number, absent: number) => {
      const totalMarked = present + late + absent;
      return totalMarked === 0
        ? 100
        : Math.round(((present + late) / totalMarked) * 100);
    };

    const studentRows: StudentReportRow[] = [];
    let chronicCount = 0;

    for (const student of students) {
      const records = windowRecords.filter((r) => r.studentId === student.id);

      // Chronic is a property of the child, not of one classroom: a transfer
      // mid-window must not hide absences by splitting them across two rows.
      const chronic = tally(records).absent >= CHRONIC_ABSENCE_THRESHOLD;
      if (chronic) chronicCount += 1;

      // Each record remembers the classroom the child was in that day, so a
      // transfer leaves the earlier classroom's figures untouched.
      const byClassroom = new Map<string, AttendanceRecordEntity[]>();
      for (const record of records) {
        const group = byClassroom.get(record.classroomId);
        if (group) group.push(record);
        else byClassroom.set(record.classroomId, [record]);
      }
      // No attendance in the window at all: attribute to where they are now.
      if (byClassroom.size === 0) byClassroom.set(student.classroomId, []);

      for (const [classroomId, classroomRecords] of byClassroom) {
        const { present, late, absent } = tally(classroomRecords);
        studentRows.push({
          studentId: student.id,
          classroomId,
          studentName: student.name,
          classroomName: classroomName(classroomId),
          present,
          late,
          absent,
          ratePct: rate(present, late, absent),
          chronic,
        });
      }
    }

    const windowTally = tally(windowRecords);
    const overallRatePct = rate(
      windowTally.present,
      windowTally.late,
      windowTally.absent,
    );

    const todayRecords = windowRecords.filter((r) => r.date === today);
    const dailySummary: ClassDailySummary[] = classrooms.map((c) => {
      const roster = students.filter(
        (s) => s.classroomId === c.id && s.status === StudentStatus.ACTIVE,
      );
      const records = todayRecords.filter((r) => r.classroomId === c.id);
      const markedToday = new Set(records.map((r) => r.studentId));
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
        // Counted from the roster rather than subtracted from it: a student
        // deactivated after being marked today leaves a record behind, and
        // subtracting would drive this negative.
        unmarked: roster.filter((s) => !markedToday.has(s.id)).length,
      };
    });

    return { overallRatePct, chronicCount, dailySummary, studentRows };
  }
}
