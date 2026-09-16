export const TELEGRAM_BOT_ADMIN_SERVICE = Symbol('TELEGRAM_BOT_ADMIN_SERVICE');

/** Why these return an outcome instead of throwing: the application layer owns
 *  the HTTP mapping, and it needs to tell two failures apart. A *rejected*
 *  call is the admin's problem — Telegram understood us and said no, usually a
 *  bad bot token. An *unreachable* call is nobody's problem — a network blip
 *  or a Telegram outage. Conflating them sends an admin off to regenerate a
 *  token that was fine all along. Returning a result rather than throwing a
 *  vendor error type also keeps Telegram's HTTP shape out of the handler and
 *  makes this trivial to fake in tests. */
export type TelegramFailure = {
  ok: false;
  reason: 'rejected' | 'unreachable';
  detail: string;
};

export type TelegramOutcome = { ok: true } | TelegramFailure;

export type TelegramWebhookInfo =
  | {
      ok: true;
      /** Empty string when the bot has no webhook registered — Telegram's own
       *  representation, passed through rather than reinterpreted here. */
      url: string;
      lastErrorMessage: string | null;
    }
  | TelegramFailure;

export interface ITelegramBotAdminService {
  /** The bot account's own @username for the given token, via Telegram's
   *  `getMe`, or `null` if the call fails (bad token, network error, Telegram
   *  outage) — callers keep whatever was cached before on `null`, rather than
   *  treating a failed lookup as "this bot has no username".
   *
   *  This one keeps its swallow-and-return-null shape deliberately: a cached
   *  username only builds invite links, and a transient blip should not blank
   *  a working one. The webhook calls below cannot afford that, because
   *  silent failure there is the defect this service exists to fix. */
  getUsername(token: string): Promise<string | null>;

  /** Point this bot's updates at `url`. Telegram echoes `secret` back in a
   *  header on every delivery, which is what proves an update really came
   *  from Telegram. Queued updates are discarded: a linking attempt made
   *  before the school was configured must not succeed retroactively. */
  setWebhook(
    token: string,
    url: string,
    secret: string,
  ): Promise<TelegramOutcome>;

  /** Remove this bot's webhook. Callers treat failure as non-fatal — the
   *  usual reason a token is being replaced is that it was revoked, which
   *  makes this call fail by definition. */
  deleteWebhook(token: string): Promise<TelegramOutcome>;

  /** What webhook Telegram actually holds for this bot right now. The whole
   *  point of asking is that our own record of what we registered can drift
   *  from reality — someone re-registers by hand, a tunnel steals it back. */
  getWebhookInfo(token: string): Promise<TelegramWebhookInfo>;
}
