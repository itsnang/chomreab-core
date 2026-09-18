export class DeleteStudentCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
  ) {}
}
