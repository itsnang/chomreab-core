import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
}

@Entity('attendance_records')
@Index(['studentId', 'date'], { unique: true })
export class AttendanceRecordEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'uuid' })
  classroomId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status: AttendanceStatus;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'uuid' })
  markedByUserId: string;

  @CreateDateColumn()
  markedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
