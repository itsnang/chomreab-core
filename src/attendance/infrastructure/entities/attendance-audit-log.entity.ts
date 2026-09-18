import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { AttendanceStatus } from './attendance-record.entity';

@Entity('attendance_audit_logs')
export class AttendanceAuditLogEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  attendanceRecordId: string;

  @Column({ type: 'uuid' })
  changedByUserId: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  previousStatus: AttendanceStatus;

  @Column({ type: 'enum', enum: AttendanceStatus })
  newStatus: AttendanceStatus;

  @CreateDateColumn()
  changedAt: Date;
}
