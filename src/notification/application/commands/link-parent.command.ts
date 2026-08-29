export class LinkParentCommand {
  constructor(
    public readonly telegramChatId: string,
    public readonly code: string,
  ) {}
}
