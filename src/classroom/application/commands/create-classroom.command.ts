export class CreateClassroomCommand {
  constructor(
    public readonly schoolId: string,
    public readonly name: string,
    public readonly gradeLabel: string | null,
    public readonly teacherId: string | null,
  ) {}
}
