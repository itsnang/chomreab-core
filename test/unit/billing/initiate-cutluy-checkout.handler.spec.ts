import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InitiateCutLuyCheckoutHandler } from '../../../src/billing/application/commands/initiate-cutluy-checkout.handler';
import { InitiateCutLuyCheckoutCommand } from '../../../src/billing/application/commands/initiate-cutluy-checkout.command';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';
import {
  CutLuyAccountSuspendedError,
  CutLuyClient,
  CutLuyQuotaExceededError,
  CutLuyRateLimitedError,
  CutLuyUnauthorizedError,
} from '../../../src/billing/infrastructure/services/cutluy-client';

describe('InitiateCutLuyCheckoutHandler', () => {
  let handler: InitiateCutLuyCheckoutHandler;
  let invoiceRepo: { findOneBy: jest.Mock; update: jest.Mock };
  let cutluy: { createPayment: jest.Mock; getPayment: jest.Mock };

  const OPEN_INVOICE = {
    id: 'invoice-1',
    schoolId: 'school-1',
    subscriptionId: 'sub-1',
    activeStudentCount: 150,
    amountCents: 1500,
    dueAt: new Date('2026-01-01'),
    status: InvoiceStatus.OPEN,
    pendingCutluyPaymentId: null,
    pendingCutluyPaymentExpiresAt: null,
  };

  beforeEach(async () => {
    invoiceRepo = {
      findOneBy: jest.fn().mockResolvedValue({ ...OPEN_INVOICE }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    cutluy = {
      createPayment: jest.fn().mockResolvedValue({
        id: 'PUETcMUOKStjZsCb',
        status: 'pending',
        amount: '15.00',
        currency: 'USD',
        checkoutUrl: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
        qrString: '00020101021229...6304AB12',
        referenceId: 'invoice-1',
        metadata: { invoiceId: 'invoice-1', schoolId: 'school-1' },
        expiresAt: '2026-01-01T00:05:00.000Z',
      }),
      getPayment: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        InitiateCutLuyCheckoutHandler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: CutLuyClient, useValue: cutluy },
      ],
    }).compile();

    handler = module.get(InitiateCutLuyCheckoutHandler);
  });

  it("looks up the Invoice scoped to the caller's own School", async () => {
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    expect(invoiceRepo.findOneBy).toHaveBeenCalledWith({
      id: 'invoice-1',
      schoolId: 'school-1',
    });
  });

  it('rejects an invoice that belongs to a different School (scoped lookup returns nothing)', async () => {
    invoiceRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(
        new InitiateCutLuyCheckoutCommand('school-2', 'invoice-1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cutluy.createPayment).not.toHaveBeenCalled();
  });

  it('rejects an invoice that is not open', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      status: InvoiceStatus.PAID,
    });
    await expect(
      handler.execute(
        new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cutluy.createPayment).not.toHaveBeenCalled();
  });

  it('creates a CutLuy payment for the exact Invoice amount', async () => {
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    expect(cutluy.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1500 }),
    );
  });

  it('tags the payment with the Invoice id as reference_id and in metadata', async () => {
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    const [params] = cutluy.createPayment.mock.calls[0] as [
      { referenceId: string; metadata: Record<string, unknown> },
    ];
    expect(params.referenceId).toBe('invoice-1');
    expect(params.metadata).toEqual({
      invoiceId: 'invoice-1',
      schoolId: 'school-1',
    });
  });

  it('generates a fresh idempotency key per attempt, not a fixed one derived from the Invoice', async () => {
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );

    const [firstCall] = cutluy.createPayment.mock.calls[0] as [
      { idempotencyKey: string },
    ];
    const [secondCall] = cutluy.createPayment.mock.calls[1] as [
      { idempotencyKey: string },
    ];
    // Deliberately NOT invoice.id: CONTEXT.md's Invoice entry allows more
    // than one payment attempt per Invoice (a failed scan, a retry after
    // expiry) — an idempotency key fixed to the Invoice would make CutLuy
    // treat a genuinely new attempt as a duplicate of an expired one.
    expect(firstCall.idempotencyKey).not.toBe('invoice-1');
    expect(firstCall.idempotencyKey).not.toBe(secondCall.idempotencyKey);
  });

  it('returns the checkout URL and QR string for the caller to present', async () => {
    const result = await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    expect(result).toEqual({
      checkoutUrl: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
      qrString: '00020101021229...6304AB12',
    });
  });

  it('records the pending CutLuy payment on the Invoice after creating one, for the next call to reuse', async () => {
    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );
    expect(invoiceRepo.update).toHaveBeenCalledWith(
      { id: 'invoice-1', schoolId: 'school-1' },
      {
        pendingCutluyPaymentId: 'PUETcMUOKStjZsCb',
        pendingCutluyPaymentExpiresAt: new Date('2026-01-01T00:05:00.000Z'),
      },
    );
  });

  it('reuses a still-live pending payment instead of minting a new one — the double-click / retry guard', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      pendingCutluyPaymentId: 'existing-payment',
      pendingCutluyPaymentExpiresAt: new Date(Date.now() + 60_000),
    });
    cutluy.getPayment.mockResolvedValue({
      id: 'existing-payment',
      status: 'pending',
      amount: '15.00',
      currency: 'USD',
      checkoutUrl: 'https://cutluy.com/pay/existing-payment',
      qrString: 'existing-qr-string',
      referenceId: 'invoice-1',
      metadata: null,
      expiresAt: '2026-01-01T00:05:00.000Z',
    });

    const result = await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );

    expect(cutluy.getPayment).toHaveBeenCalledWith('existing-payment');
    expect(cutluy.createPayment).not.toHaveBeenCalled();
    expect(result).toEqual({
      checkoutUrl: 'https://cutluy.com/pay/existing-payment',
      qrString: 'existing-qr-string',
    });
  });

  it('mints a new payment once the pending one has expired, CutLuy having no cancel endpoint to clear it explicitly', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      pendingCutluyPaymentId: 'expired-payment',
      pendingCutluyPaymentExpiresAt: new Date(Date.now() - 1000),
    });

    await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );

    expect(cutluy.getPayment).not.toHaveBeenCalled();
    expect(cutluy.createPayment).toHaveBeenCalled();
  });

  it('falls through to creating a new payment when reusing the pending one fails', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      pendingCutluyPaymentId: 'gone-payment',
      pendingCutluyPaymentExpiresAt: new Date(Date.now() + 60_000),
    });
    cutluy.getPayment.mockRejectedValue(new Error('not found'));

    const result = await handler.execute(
      new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
    );

    expect(cutluy.createPayment).toHaveBeenCalled();
    expect(result).toEqual({
      checkoutUrl: 'https://cutluy.com/pay/PUETcMUOKStjZsCb',
      qrString: '00020101021229...6304AB12',
    });
  });

  it('translates a 429 into a 503 carrying retryAfterSeconds for the caller to back off on', async () => {
    cutluy.createPayment.mockRejectedValue(
      new CutLuyRateLimitedError('slow down', 17),
    );
    const error = await handler
      .execute(new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const response = (error as ServiceUnavailableException).getResponse() as {
      retryAfterSeconds: number;
    };
    expect(response.retryAfterSeconds).toBe(17);
  });

  it('translates a 402 quota-exceeded error into an actionable BadRequestException', async () => {
    cutluy.createPayment.mockRejectedValue(
      new CutLuyQuotaExceededError('over plan', 402, 'quota_exceeded'),
    );
    await expect(
      handler.execute(
        new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('translates a 401 into a generic InternalServerErrorException, never exposing CutLuy wording', async () => {
    cutluy.createPayment.mockRejectedValue(
      new CutLuyUnauthorizedError('bad key', 401, 'unauthorized'),
    );
    const error = await handler
      .execute(new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).not.toContain('bad key');
  });

  it("translates a 403 account-suspended error the same way as a 401 — our account, not the caller's problem", async () => {
    cutluy.createPayment.mockRejectedValue(
      new CutLuyAccountSuspendedError('suspended', 403, 'account_suspended'),
    );
    await expect(
      handler.execute(
        new InitiateCutLuyCheckoutCommand('school-1', 'invoice-1'),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
