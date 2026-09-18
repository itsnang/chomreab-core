import type { StudentStatus } from '../../infrastructure/entities/student.entity';

export class UpdateStudentCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly classroomId?: string,
    public readonly status?: StudentStatus,
  ) {}
}
