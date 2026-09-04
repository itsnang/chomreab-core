export class GetMyClassesTodayQuery {
  constructor(
    public readonly teacherId: string,
    public readonly date: string,
  ) {}
}
