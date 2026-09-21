import { createHmac } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  type RawBodyRequest,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Request } from 'express';
import { CutLuyWebhookController } from '../../../src/billing/api/controllers/cutluy-webhook.controller';
import { PaymentEntity } from '../../../src/billing/infrastructure/entities/payment.entity';
import { MarkInvoicePaidCommand } from '../../../src/billing/application/commands/mark-invoice-paid.command';

const SECRET = 'test-webhook-secret';

function sign(timestamp: number, rawBody: string): string {
  const hmac = createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

function request(rawBody: string | undefined): RawBodyRequest<Request> {
  return {
    rawBody: rawBody === undefined ? undefined : Buffer.from(rawBody, 'utf8'),
  } as RawBodyRequest<Request>;
}

/** Matches a real CutLuy test delivery captured against the production
 *  webhook on 2026-09-21 — an event envelope (`id`/`type`/`data.payment`),
 *  not the flat `{id, status, reference_id, metadata}` shape the original
 *  integration docs described. */
function envelope(overrides: {
  type?: string;
  paymentId?: string;
  status?: string;
  referenceId?: string | null;
  metadata?: { invoiceId?: string } | null;
}): string {
  // `??` would treat an explicit `null` override (used to test "no
  // reference_id at all") the same as "not overridden" — check `in` instead
  // so a deliberate null passes through.
  const referenceId =
    'referenceId' in overrides ? overrides.referenceId : 'invoice-1';
  const metadata =
    'metadata' in overrides
      ? overrides.metadata
      : { invoiceId: 'invoice-1', schoolId: 'school-1' };
  return JSON.stringify({
    id: 'evt_test_1',
    type: overrides.type ?? 'payment.completed',
    created: '2026-09-21T00:00:00.000Z',
    data: {
      payment: {
        id: overrides.paymentId ?? 'PUETcMUOKStjZsCb',
        status: overrides.status ?? 'paid',
        amount: '15.00',
        currency: 'USD',
        reference_id: referenceId,
        metadata,
      },
    },
  });
}

describe('CutLuyWebhookController', () => {
  let controller: CutLuyWebhookController;
  let commandBus: { execute: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let paymentRepo: { findOneBy: jest.Mock };

  const PAYLOAD = envelope({});

  beforeEach(async () => {
    commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    configService = { getOrThrow: jest.fn().mockReturnValue(SECRET) };
    paymentRepo = { findOneBy: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      controllers: [CutLuyWebhookController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(PaymentEntity), useValue: paymentRepo },
      ],
    }).compile();

    controller = module.get(CutLuyWebhookController);
  });

  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a validly-signed payment.completed event and marks the Invoice paid', async () => {
    const signature = sign(now(), PAYLOAD);
    await controller.handleWebhook(request(PAYLOAD), signature);

    expect(commandBus.execute).toHaveBeenCalledWith(
      new MarkInvoicePaidCommand(
        'invoice-1',
        'PUETcMUOKStjZsCb',
        JSON.parse(PAYLOAD) as Record<string, unknown>,
      ),
    );
  });

  it('rejects a request with no signature header at all', async () => {
    await expect(
      controller.handleWebhook(request(PAYLOAD), undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('rejects a request with no raw body captured', async () => {
    const signature = sign(now(), PAYLOAD);
    await expect(
      controller.handleWebhook(request(undefined), signature),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a malformed signature header', async () => {
    await expect(
      controller.handleWebhook(request(PAYLOAD), 'not-a-real-signature'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const wrongHmac = createHmac('sha256', 'wrong-secret')
      .update(`${now()}.${PAYLOAD}`)
      .digest('hex');
    const signature = `t=${now()},v1=${wrongHmac}`;
    await expect(
      controller.handleWebhook(request(PAYLOAD), signature),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('rejects a signature computed over a different body than what was actually sent', async () => {
    const signature = sign(now(), PAYLOAD);
    const tamperedBody = PAYLOAD.replace('"paid"', '"failed"');
    await expect(
      controller.handleWebhook(request(tamperedBody), signature),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a timestamp older than 5 minutes (replay protection)', async () => {
    const staleTimestamp = now() - 301;
    const signature = sign(staleTimestamp, PAYLOAD);
    await expect(
      controller.handleWebhook(request(PAYLOAD), signature),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('accepts a timestamp just under the 5-minute window', async () => {
    const signature = sign(now() - 299, PAYLOAD);
    await controller.handleWebhook(request(PAYLOAD), signature);
    expect(commandBus.execute).toHaveBeenCalled();
  });

  it('rejects a timestamp from the future beyond the tolerance window', async () => {
    const signature = sign(now() + 301, PAYLOAD);
    await expect(
      controller.handleWebhook(request(PAYLOAD), signature),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not fulfil a payment.completed envelope whose nested Payment.status is not paid (a captured-and-replayed scanned/expired/failed delivery with the envelope type swapped)', async () => {
    // `type` and `status` both live inside the signed body — a real CutLuy
    // delivery for a payment that was only scanned, captured and replayed
    // with `type` changed to payment.completed, must still not fulfil,
    // because the signed Payment's own status says "scanned", not "paid".
    const scannedPayload = envelope({ status: 'scanned' });
    const signature = sign(now(), scannedPayload);
    const result = await controller.handleWebhook(
      request(scannedPayload),
      signature,
    );
    expect(result).toEqual({ ok: true });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('acknowledges but does not fulfil on payment.scanned', async () => {
    const scannedEnvelope = envelope({
      type: 'payment.scanned',
      status: 'scanned',
    });
    const signature = sign(now(), scannedEnvelope);
    const result = await controller.handleWebhook(
      request(scannedEnvelope),
      signature,
    );
    expect(result).toEqual({ ok: true });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('acknowledges but does not fulfil on payment.expired', async () => {
    const expiredEnvelope = envelope({
      type: 'payment.expired',
      status: 'expired',
    });
    const signature = sign(now(), expiredEnvelope);
    await controller.handleWebhook(request(expiredEnvelope), signature);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('acknowledges but does not fulfil on payment.failed', async () => {
    const failedEnvelope = envelope({
      type: 'payment.failed',
      status: 'failed',
    });
    const signature = sign(now(), failedEnvelope);
    await controller.handleWebhook(request(failedEnvelope), signature);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('is idempotent: a payment id already recorded is acknowledged without re-fulfilling', async () => {
    paymentRepo.findOneBy.mockResolvedValue({
      id: 'payment-row-1',
      cutluyReference: 'PUETcMUOKStjZsCb',
    });
    const signature = sign(now(), PAYLOAD);
    const result = await controller.handleWebhook(request(PAYLOAD), signature);
    expect(result).toEqual({ ok: true });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('swallows a BadRequestException only when a concurrent delivery has since recorded this exact Payment', async () => {
    // Pre-check (before execute): no Payment yet — this delivery looks new.
    // Post-exception re-check: a concurrent delivery won the race and its
    // Payment now exists — that's what makes this one safe to swallow.
    paymentRepo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'payment-row-1',
      cutluyReference: 'PUETcMUOKStjZsCb',
    });
    commandBus.execute.mockRejectedValue(
      new BadRequestException('Invoice is not open for payment'),
    );
    const signature = sign(now(), PAYLOAD);
    const result = await controller.handleWebhook(request(PAYLOAD), signature);
    expect(result).toEqual({ ok: true });
  });

  it('re-throws a BadRequestException that is NOT explained by a resolved race (a genuinely different rejection)', async () => {
    // Both the pre-check and the post-exception re-check find no Payment —
    // this BadRequestException was not the idempotency race, so swallowing
    // it would hide a real failure from CutLuy's retry mechanism.
    paymentRepo.findOneBy.mockResolvedValue(null);
    commandBus.execute.mockRejectedValue(
      new BadRequestException('Some other, unrelated validation failure'),
    );
    const signature = sign(now(), PAYLOAD);
    await expect(
      controller.handleWebhook(request(PAYLOAD), signature),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a genuine unexpected error propagate so CutLuy retries', async () => {
    commandBus.execute.mockRejectedValue(new Error('database connection lost'));
    const signature = sign(now(), PAYLOAD);
    await expect(
      controller.handleWebhook(request(PAYLOAD), signature),
    ).rejects.toThrow('database connection lost');
  });

  it('rejects a payload with no reference_id and no metadata.invoiceId to key off', async () => {
    const bodyWithNoInvoice = envelope({ referenceId: null, metadata: null });
    const signature = sign(now(), bodyWithNoInvoice);
    const result = await controller.handleWebhook(
      request(bodyWithNoInvoice),
      signature,
    );
    // Acknowledged (retrying can't fix a structurally incomplete payload),
    // but never dispatched as if it were a real, fulfillable payment.
    expect(result).toEqual({ ok: true });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('falls back to metadata.invoiceId when reference_id is absent', async () => {
    const body = envelope({
      paymentId: 'PUETc',
      referenceId: null,
      metadata: { invoiceId: 'invoice-9' },
    });
    const signature = sign(now(), body);
    await controller.handleWebhook(request(body), signature);
    expect(commandBus.execute).toHaveBeenCalledWith(
      new MarkInvoicePaidCommand(
        'invoice-9',
        'PUETc',
        JSON.parse(body) as Record<string, unknown>,
      ),
    );
  });
});
