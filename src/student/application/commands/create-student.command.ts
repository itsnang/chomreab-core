export class CreateStudentCommand {
  constructor(
    public readonly name: string,
    public readonly classroomId: string,
  ) {}
}
