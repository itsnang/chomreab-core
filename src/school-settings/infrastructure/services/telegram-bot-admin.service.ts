import { Injectable } from '@nestjs/common';
import type {
  ITelegramBotAdminService,
  TelegramOutcome,
  TelegramWebhookInfo,
} from '../../application/interfaces/telegram-bot-admin.service';

interface TelegramEnvelope<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

/** Telegram answers a refused call with a 4xx and a `description`, and is
 *  simply absent for a network failure or an outage. That split is the one
 *  the application layer needs, so it is drawn here once and every method
 *  reports through the same shape. A 5xx counts as unreachable rather than
 *  rejected: Telegram being broken says nothing about the admin's token. */
async function call<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<
  | { ok: true; result: T | undefined }
  | { ok: false; reason: 'rejected' | 'unreachable'; detail: string }
> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: error instanceof Error ? error.message : 'Network error',
    };
  }

  let envelope: TelegramEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as TelegramEnvelope<T>;
  } catch {
    // A response that is not JSON at all is a proxy or an outage page, never
    // Telegram refusing us on the merits.
    return {
      ok: false,
      reason: 'unreachable',
      detail: `Telegram returned a non-JSON response (${response.status})`,
    };
  }

  if (!response.ok || !envelope.ok) {
    return {
      ok: false,
      reason: response.status >= 500 ? 'unreachable' : 'rejected',
      detail: envelope.description ?? `Telegram error ${response.status}`,
    };
  }

  return { ok: true, result: envelope.result };
}

@Injectable()
export class TelegramBotAdminService implements ITelegramBotAdminService {
  async getUsername(token: string): Promise<string | null> {
    const outcome = await call<{ username?: string }>(token, 'getMe');
    if (!outcome.ok) return null;
    return outcome.result?.username ?? null;
  }

  async setWebhook(
    token: string,
    url: string,
    secret: string,
  ): Promise<TelegramOutcome> {
    const outcome = await call(token, 'setWebhook', {
      url,
      secret_token: secret,
      drop_pending_updates: true,
    });
    return outcome.ok ? { ok: true } : outcome;
  }

  async deleteWebhook(token: string): Promise<TelegramOutcome> {
    const outcome = await call(token, 'deleteWebhook');
    return outcome.ok ? { ok: true } : outcome;
  }

  async getWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    const outcome = await call<{
      url?: string;
      last_error_message?: string;
    }>(token, 'getWebhookInfo');
    if (!outcome.ok) return outcome;
    return {
      ok: true,
      url: outcome.result?.url ?? '',
      lastErrorMessage: outcome.result?.last_error_message ?? null,
    };
  }
}
