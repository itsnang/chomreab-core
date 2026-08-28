export class LoginAdminCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
