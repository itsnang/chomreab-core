export class GetReportsSummaryQuery {
  constructor(
    public readonly schoolId: string,
    public readonly today: string,
  ) {}
}
