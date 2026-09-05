export class CreateTeacherCommand {
  constructor(
    public readonly name: string,
    public readonly email: string,
  ) {}
}
