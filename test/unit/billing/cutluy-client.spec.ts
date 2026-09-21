import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  CutLuyAccountSuspendedError,
  CutLuyClient,
  CutLuyQuotaExceededError,
  CutLuyRateLimitedError,
  CutLuyUnauthorizedError,
} from '../../../src/billing/infrastructure/services/cutluy-client';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
  } as Response;
}

describe('CutLuyClient', () => {
  let client: CutLuyClient;
  let configService: { getOrThrow: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'cutluy.apiKey') return 'ck_live_test';
        if (key === 'cutluy.baseUrl') return 'https://cutluy.com';
        throw new Error(`unexpected config key ${key}`);
      }),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [
        CutLuyClient,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get(CutLuyClient);
  });

  it('sends the amount as a decimal number of dollars, not cents', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: 'PUETcMUOKStjZsCb',
        status: 'pending',
        amount: '1.50',
        currency: 'USD',
        checkout_url: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
        qr_string: '00020101021229...6304AB12',
      }),
    );

    await client.createPayment({ amountCents: 150 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { amount: number };
    expect(body.amount).toBe(1.5);
  });

  it('avoids floating-point drift at the cent boundary', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: 'x',
        status: 'pending',
        amount: '0.29',
        currency: 'USD',
        checkout_url: 'u',
        qr_string: 'q',
      }),
    );
    await client.createPayment({ amountCents: 29 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { amount: number };
    expect(body.amount).toBe(0.29);
  });

  it('rejects a non-positive amount before ever calling fetch', async () => {
    await expect(client.createPayment({ amountCents: 0 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the Authorization header and content type', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: 'x',
        status: 'pending',
        amount: '1.00',
        currency: 'USD',
        checkout_url: 'u',
        qr_string: 'q',
      }),
    );
    await client.createPayment({ amountCents: 100 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ck_live_test');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('forwards reference_id, metadata and idempotency_key', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: 'x',
        status: 'pending',
        amount: '1.00',
        currency: 'USD',
        checkout_url: 'u',
        qr_string: 'q',
      }),
    );
    await client.createPayment({
      amountCents: 100,
      referenceId: 'invoice-1',
      metadata: { schoolId: 'school-1' },
      idempotencyKey: 'attempt-1',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.reference_id).toBe('invoice-1');
    expect(body.metadata).toEqual({ schoolId: 'school-1' });
    expect(body.idempotency_key).toBe('attempt-1');
  });

  it('maps a successful response into camelCase, including reference_id and metadata', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: 'PUETcMUOKStjZsCb',
        status: 'pending',
        amount: '1.50',
        currency: 'USD',
        checkout_url: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
        qr_string: '00020101021229...6304AB12',
        reference_id: 'invoice-1',
        metadata: { schoolId: 'school-1' },
      }),
    );
    const payment = await client.createPayment({ amountCents: 150 });
    expect(payment).toEqual({
      id: 'PUETcMUOKStjZsCb',
      status: 'pending',
      amount: '1.50',
      currency: 'USD',
      checkoutUrl: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
      qrString: '00020101021229...6304AB12',
      referenceId: 'invoice-1',
      metadata: { schoolId: 'school-1' },
    });
  });

  it('throws CutLuyUnauthorizedError on 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: 'unauthorized', message: 'Bad API key' }),
    );
    await expect(
      client.createPayment({ amountCents: 100 }),
    ).rejects.toBeInstanceOf(CutLuyUnauthorizedError);
  });

  it('throws CutLuyQuotaExceededError on 402', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(402, {
        error: 'quota_exceeded',
        message: 'Plan limit reached',
      }),
    );
    await expect(
      client.createPayment({ amountCents: 100 }),
    ).rejects.toBeInstanceOf(CutLuyQuotaExceededError);
  });

  it('throws CutLuyAccountSuspendedError on 403', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        error: 'account_suspended',
        message: 'Account under review',
      }),
    );
    await expect(
      client.createPayment({ amountCents: 100 }),
    ).rejects.toBeInstanceOf(CutLuyAccountSuspendedError);
  });

  it('throws CutLuyRateLimitedError on 429 and captures Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        429,
        { error: 'rate_limited', message: 'Slow down' },
        { 'retry-after': '17' },
      ),
    );
    const error = await client
      .createPayment({ amountCents: 100 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CutLuyRateLimitedError);
    expect((error as CutLuyRateLimitedError).retryAfterSeconds).toBe(17);
  });

  it('defaults Retry-After to 60 seconds when CutLuy omits the header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: 'rate_limited' }));
    const error = await client
      .createPayment({ amountCents: 100 })
      .catch((e: unknown) => e);
    expect((error as CutLuyRateLimitedError).retryAfterSeconds).toBe(60);
  });

  it('getPayment reads by id with no body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: 'PUETc',
        status: 'paid',
        amount: '1.50',
        currency: 'USD',
        checkout_url: 'u',
        qr_string: 'q',
      }),
    );
    const payment = await client.getPayment('PUETc');
    expect(payment.status).toBe('paid');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cutluy.com/v1/payments/PUETc');
    expect(init.method).toBe('GET');
  });
});
