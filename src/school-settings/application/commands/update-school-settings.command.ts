export class UpdateSchoolSettingsCommand {
  constructor(
    public readonly schoolId: string,
    public readonly schoolName: string,
    public readonly lateCutoffMinutes: number,
    public readonly absenceMessageTemplate: string,
  ) {}
}
