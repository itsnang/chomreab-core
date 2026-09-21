import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CutLuyPaymentStatus =
  | 'pending'
  | 'scanned'
  | 'paid'
  | 'expired'
  | 'failed';

export interface CutLuyPayment {
  id: string;
  status: CutLuyPaymentStatus;
  amount: string;
  currency: string;
  checkoutUrl: string;
  qrString: string;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
}

interface CutLuyPaymentApi {
  id: string;
  status: CutLuyPaymentStatus;
  amount: string;
  currency: string;
  checkout_url: string;
  qr_string: string;
  reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Base for every named CutLuy failure — lets callers pattern-match on
 *  `instanceof` without re-parsing `{ error, message }` at each call site. */
export class CutLuyApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string | undefined,
  ) {
    super(message);
    // new.target, not the literal class name — so a subclass like
    // CutLuyUnauthorizedError logs its own name instead of the base class's,
    // which matters here because the handler logs `error.name` directly.
    this.name = new.target.name;
  }
}

export class CutLuyUnauthorizedError extends CutLuyApiError {}
export class CutLuyQuotaExceededError extends CutLuyApiError {}
export class CutLuyAccountSuspendedError extends CutLuyApiError {}

/** 429 carries no payment-domain meaning of its own — `retryAfterSeconds` is
 *  the one piece of information a caller actually needs to act correctly
 *  (honour it, don't tight-loop). */
export class CutLuyRateLimitedError extends CutLuyApiError {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message, 429, 'rate_limited');
  }
}

function centsToDecimal(cents: number): number {
  // Route through toFixed rather than a bare division so a value like 150
  // cents can't come out as 1.4999999999999998 — CutLuy's minimum is 0.01,
  // and floating-point noise at the second decimal place is exactly the
  // kind of bug that only shows up on specific cent amounts in production.
  return Number((cents / 100).toFixed(2));
}

/**
 * Thin wrapper over CutLuy's REST API (https://cutluy.com/docs). Owns
 * request construction and the shared error-mapping for every call; the
 * business decision of *when* to create or re-check a payment lives in the
 * command handlers that use this, not here.
 */
@Injectable()
export class CutLuyClient {
  constructor(private readonly configService: ConfigService) {}

  /**
   * amountCents must be a real, positive charge — CutLuy's own minimum is
   * $0.01, and a $0 Invoice is settled directly by StartSubscriptionHandler /
   * GenerateRenewalInvoicesHandler without ever reaching checkout, so this
   * is a defensive guard against a caller bug, not a real runtime path.
   */
  async createPayment(params: {
    amountCents: number;
    referenceId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<CutLuyPayment> {
    if (params.amountCents <= 0) {
      throw new Error(
        `CutLuy payments must be a positive amount, got ${params.amountCents} cents`,
      );
    }

    const response = await this.request('/v1/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: centsToDecimal(params.amountCents),
        reference_id: params.referenceId,
        metadata: params.metadata,
        idempotency_key: params.idempotencyKey,
      }),
    });
    return this.parsePayment(response);
  }

  async getPayment(id: string): Promise<CutLuyPayment> {
    const response = await this.request(
      `/v1/payments/${encodeURIComponent(id)}`,
      {
        method: 'GET',
      },
    );
    return this.parsePayment(response);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = this.configService.getOrThrow<string>('cutluy.apiKey');
    const baseUrl = this.configService.getOrThrow<string>('cutluy.baseUrl');

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '60');
      throw new CutLuyRateLimitedError(
        'CutLuy rate limit hit — creates are capped at 60/min, reads at 600/min per API key',
        Number.isFinite(retryAfter) ? retryAfter : 60,
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      const code = body?.error;
      const message =
        body?.message ?? `CutLuy request failed with ${response.status}`;

      if (response.status === 401 || code === 'unauthorized') {
        throw new CutLuyUnauthorizedError(message, response.status, code);
      }
      if (response.status === 402 || code === 'quota_exceeded') {
        throw new CutLuyQuotaExceededError(message, response.status, code);
      }
      if (response.status === 403 || code === 'account_suspended') {
        throw new CutLuyAccountSuspendedError(message, response.status, code);
      }
      throw new CutLuyApiError(message, response.status, code);
    }

    return response;
  }

  private async parsePayment(response: Response): Promise<CutLuyPayment> {
    const body = (await response.json()) as CutLuyPaymentApi;
    return {
      id: body.id,
      status: body.status,
      amount: body.amount,
      currency: body.currency,
      checkoutUrl: body.checkout_url,
      qrString: body.qr_string,
      referenceId: body.reference_id ?? null,
      metadata: body.metadata ?? null,
    };
  }
}
