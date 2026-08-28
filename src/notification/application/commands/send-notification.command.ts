export class SendNotificationCommand {
  constructor(
    public readonly chatId: string,
    public readonly message: string,
  ) {}
}
