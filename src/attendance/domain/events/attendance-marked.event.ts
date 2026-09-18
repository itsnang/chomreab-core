export class AttendanceMarkedEvent {
  constructor(
    public readonly schoolId: string,
    public readonly studentId: string,
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: 'present' | 'absent' | 'late',
    public readonly note: string | null,
  ) {}
}
