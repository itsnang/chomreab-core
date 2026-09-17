import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import {
  StudentEntity,
  StudentStatus,
} from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { GetMyClassesTodayQuery } from './get-my-classes-today.query';

export interface MyClassSummary {
  classroomId: string;
  name: string;
  gradeLabel: string | null;
  studentCount: number;
  unmarkedCount: number;
}

@Injectable()
@QueryHandler(GetMyClassesTodayQuery)
export class GetMyClassesTodayHandler implements IQueryHandler<
  GetMyClassesTodayQuery,
  MyClassSummary[]
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetMyClassesTodayQuery): Promise<MyClassSummary[]> {
    const classroomRepo = new ScopedRepository(
      this.classroomRepository,
      query.schoolId,
    );
    const studentRepo = new ScopedRepository(
      this.studentRepository,
      query.schoolId,
    );
    const recordRepo = new ScopedRepository(
      this.recordRepository,
      query.schoolId,
    );

    const classrooms = await classroomRepo.find({
      where: { teacherId: query.teacherId },
      order: { name: 'ASC' },
    });
    if (classrooms.length === 0) return [];

    const classroomIds = classrooms.map((c) => c.id);
    const [students, records] = await Promise.all([
      // Deactivated students are off the roster, so they must not inflate
      // studentCount or leave a class permanently "N left".
      studentRepo.find({
        where: { classroomId: In(classroomIds), status: StudentStatus.ACTIVE },
      }),
      recordRepo.find({
        where: { date: query.date, classroomId: In(classroomIds) },
      }),
    ]);
    const markedStudentIds = new Set(records.map((r) => r.studentId));

    return classrooms.map((c) => {
      const roster = students.filter((s) => s.classroomId === c.id);
      const unmarkedCount = roster.filter(
        (s) => !markedStudentIds.has(s.id),
      ).length;
      return {
        classroomId: c.id,
        name: c.name,
        gradeLabel: c.gradeLabel,
        studentCount: roster.length,
        unmarkedCount,
      };
    });
  }
}
