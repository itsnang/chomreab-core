export class GetAuditLogQuery {
  constructor(
    public readonly schoolId: string,
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
