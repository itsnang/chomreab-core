export class UpdateClassroomCommand {
  constructor(
    public readonly id: string,
    public readonly name?: string,
    public readonly gradeLabel?: string | null,
    public readonly teacherId?: string | null,
  ) {}
}
