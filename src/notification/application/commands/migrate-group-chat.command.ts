export class MigrateGroupChatCommand {
  constructor(
    public readonly oldChatId: string,
    public readonly newChatId: string,
  ) {}
}
