import type { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class BulkMarkAttendanceCommand {
  constructor(
    public readonly studentIds: string[],
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: AttendanceStatus,
    public readonly markedByUserId: string,
  ) {}
}
