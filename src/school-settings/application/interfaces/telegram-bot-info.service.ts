export const TELEGRAM_BOT_INFO_SERVICE = Symbol('TELEGRAM_BOT_INFO_SERVICE');

export interface ITelegramBotInfoService {
  /** The bot account's own @username for the given token, via Telegram's
   *  `getMe`, or `null` if the call fails (bad token, network error, Telegram
   *  outage) — callers keep whatever was cached before on `null`, rather than
   *  treating a failed lookup as "this bot has no username". */
  getUsername(token: string): Promise<string | null>;
}
