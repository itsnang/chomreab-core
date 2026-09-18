export class CreateTeacherCommand {
  constructor(
    public readonly schoolId: string,
    public readonly name: string,
    public readonly email: string,
  ) {}
}
