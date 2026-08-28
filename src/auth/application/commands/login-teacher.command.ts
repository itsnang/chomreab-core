export class LoginTeacherCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
