export class GetRosterQuery {
  constructor(
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
