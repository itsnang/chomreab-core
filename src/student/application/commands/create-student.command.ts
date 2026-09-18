export class CreateStudentCommand {
  constructor(
    public readonly schoolId: string,
    public readonly name: string,
    public readonly classroomId: string,
  ) {}
}
