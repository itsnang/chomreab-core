export class DeleteTeacherCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
  ) {}
}
