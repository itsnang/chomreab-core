export class LinkParentCommand {
  constructor(
    public readonly telegramChatId: string,
    public readonly code: string,
    /** Mirrors Telegram's own `chat.type`, collapsed to the two cases that
     *  change redemption behaviour: a private DM burns the code, a group (or
     *  supergroup) does not, so the same code can add the bot to more than
     *  one family group, or be reapplied after an accidental removal. */
    public readonly chatType: 'private' | 'group',
  ) {}
}
