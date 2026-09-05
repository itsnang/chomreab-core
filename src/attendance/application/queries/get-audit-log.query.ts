export class GetAuditLogQuery {
  constructor(
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
