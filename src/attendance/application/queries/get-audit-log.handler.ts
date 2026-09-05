import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceAuditLogEntity } from '../../infrastructure/entities/attendance-audit-log.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { UserEntity } from '../../../shared/entities/user.entity';
import { GetAuditLogQuery } from './get-audit-log.query';

export interface AuditLogEntry {
  changedAt: Date;
  studentName: string;
  changedByName: string;
  previousStatus: string;
  newStatus: string;
}

@Injectable()
@QueryHandler(GetAuditLogQuery)
export class GetAuditLogHandler implements IQueryHandler<
  GetAuditLogQuery,
  AuditLogEntry[]
> {
  constructor(
    @InjectRepository(AttendanceAuditLogEntity)
    private readonly auditRepository: Repository<AttendanceAuditLogEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(query: GetAuditLogQuery): Promise<AuditLogEntry[]> {
    const records = await this.recordRepository.find({
      where: { classroomId: query.classroomId, date: query.date },
    });
    if (records.length === 0) return [];

    const recordById = new Map(records.map((r) => [r.id, r]));
    const entries = await this.auditRepository.find({
      where: { attendanceRecordId: In(records.map((r) => r.id)) },
      order: { changedAt: 'DESC' },
    });
    if (entries.length === 0) return [];

    const studentIds = [
      ...new Set(
        entries
          .map((e) => recordById.get(e.attendanceRecordId)?.studentId)
          .filter((id): id is string => !!id),
      ),
    ];
    const userIds = [...new Set(entries.map((e) => e.changedByUserId))];
    const [students, users] = await Promise.all([
      this.studentRepository.find({ where: { id: In(studentIds) } }),
      this.userRepository.find({ where: { id: In(userIds) } }),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return entries.map((e) => {
      const record = recordById.get(e.attendanceRecordId);
      const student = record ? studentById.get(record.studentId) : undefined;
      const user = userById.get(e.changedByUserId);
      return {
        changedAt: e.changedAt,
        studentName: student?.name ?? 'Unknown student',
        changedByName: user?.name ?? 'Unknown',
        previousStatus: e.previousStatus,
        newStatus: e.newStatus,
      };
    });
  }
}
