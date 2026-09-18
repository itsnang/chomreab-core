import type { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class MarkAttendanceCommand {
  constructor(
    public readonly schoolId: string,
    public readonly studentId: string,
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: AttendanceStatus,
    public readonly note: string | null,
    public readonly markedByUserId: string,
  ) {}
}
