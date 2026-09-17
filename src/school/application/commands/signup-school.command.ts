export class SignupSchoolCommand {
  constructor(
    public readonly schoolName: string,
    public readonly adminName: string,
    public readonly adminEmail: string,
    public readonly password: string,
  ) {}
}
