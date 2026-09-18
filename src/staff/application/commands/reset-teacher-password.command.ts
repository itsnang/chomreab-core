export class ResetTeacherPasswordCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
  ) {}
}
