export class UpdateTeacherCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly email?: string,
  ) {}
}
