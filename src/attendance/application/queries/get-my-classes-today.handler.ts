import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
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
    const classrooms = await this.classroomRepository.find({
      where: { teacherId: query.teacherId },
      order: { name: 'ASC' },
    });
    if (classrooms.length === 0) return [];

    const [students, records] = await Promise.all([
      this.studentRepository.find(),
      this.recordRepository.find({ where: { date: query.date } }),
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
