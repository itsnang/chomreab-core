export class GetMyClassesTodayQuery {
  constructor(
    public readonly schoolId: string,
    public readonly teacherId: string,
    public readonly date: string,
  ) {}
}
