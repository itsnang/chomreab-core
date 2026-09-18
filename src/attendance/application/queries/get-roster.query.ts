export class GetRosterQuery {
  constructor(
    public readonly schoolId: string,
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
