export class GetStudentQuery {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
  ) {}
}
