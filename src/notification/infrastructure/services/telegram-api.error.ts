/** Thrown by `TelegramService.sendMessage` on a non-2xx response. Carries the
 *  HTTP status so callers can distinguish "this chat is gone" (403 — the bot
 *  was blocked, or removed from a group) from any other failure, instead of
 *  parsing a status code back out of an error message string. */
export class TelegramApiError extends Error {
  constructor(public readonly status: number) {
    super(`Telegram API error: ${status}`);
    this.name = 'TelegramApiError';
  }
}
