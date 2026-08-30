export class CreateClassroomCommand {
  constructor(
    public readonly name: string,
    public readonly gradeLabel: string | null,
    public readonly teacherId: string | null,
  ) {}
}
