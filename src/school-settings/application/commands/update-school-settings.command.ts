export class UpdateSchoolSettingsCommand {
  constructor(
    public readonly schoolName: string,
    public readonly lateCutoffMinutes: number,
    public readonly absenceMessageTemplate: string,
    public readonly telegramBotToken: string | null,
  ) {}
}
