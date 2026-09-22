import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../infrastructure/entities/invoice.entity';
import {
  CutLuyAccountSuspendedError,
  CutLuyClient,
  CutLuyQuotaExceededError,
  CutLuyRateLimitedError,
  CutLuyUnauthorizedError,
} from '../../infrastructure/services/cutluy-client';
import { InitiateCutLuyCheckoutCommand } from './initiate-cutluy-checkout.command';

export interface CutLuyCheckout {
  checkoutUrl: string;
  qrString: string;
}

/**
 * Starts a CutLuy payment for one Invoice and hands back where to send the
 * payer. This is a thin adapter, not where the billing state machine lives —
 * confirmation only ever comes from CutLuyWebhookController, never from the
 * caller reaching this endpoint or following the returned URL.
 */
@Injectable()
@CommandHandler(InitiateCutLuyCheckoutCommand)
export class InitiateCutLuyCheckoutHandler implements ICommandHandler<
  InitiateCutLuyCheckoutCommand,
  CutLuyCheckout
> {
  private readonly logger = new Logger(InitiateCutLuyCheckoutHandler.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    private readonly cutluy: CutLuyClient,
  ) {}

  async execute(
    command: InitiateCutLuyCheckoutCommand,
  ): Promise<CutLuyCheckout> {
    const invoices = new ScopedRepository(
      this.invoiceRepository,
      command.schoolId,
    );
    const invoice = await invoices.findOneBy({ id: command.invoiceId });
    if (!invoice || invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException('Invoice is not open for payment');
    }

    const reused = await this.reuseLivePayment(invoice);
    if (reused) return reused;

    // A fresh key per attempt, not a fixed one derived from the Invoice —
    // see the test file for why: CONTEXT.md's Invoice entry expects more
    // than one payment attempt per Invoice, and reusing invoice.id forever
    // would make CutLuy treat a real second attempt as a duplicate of an
    // expired first one. `reuseLivePayment` above is the actual guard
    // against a double-click minting two *simultaneously live* payments —
    // this key just keeps each genuinely new attempt distinct from the
    // last.
    try {
      const payment = await this.cutluy.createPayment({
        amountCents: invoice.amountCents,
        referenceId: invoice.id,
        metadata: { invoiceId: invoice.id, schoolId: invoice.schoolId },
        idempotencyKey: randomUUID(),
      });
      // CutLuy has no cancel/void endpoint, and a payment self-expires in
      // ~5 minutes (docs), so "avoid a second live payment in the first
      // place" is the only fix available — recording this one is what lets
      // the check above catch a retry or a double-click before it happens.
      await invoices.update(
        { id: invoice.id },
        {
          pendingCutluyPaymentId: payment.id,
          pendingCutluyPaymentExpiresAt: new Date(payment.expiresAt),
        },
      );
      return { checkoutUrl: payment.checkoutUrl, qrString: payment.qrString };
    } catch (error) {
      throw this.translateCutLuyError(error, invoice.id);
    }
  }

  /**
   * If this Invoice already has a CutLuy payment that hasn't expired yet,
   * re-reads it and returns its checkout details instead of minting a new
   * one — the fix for a double-click or a retried request otherwise leaving
   * two live payments open for the same Invoice, with no CutLuy endpoint to
   * cancel either. Purely an optimization: any failure reading the existing
   * payment (CutLuy briefly unreachable, the row somehow purged on their
   * side) just falls through to creating a fresh one below, since that path
   * always works and this one only ever saves an API call.
   */
  private async reuseLivePayment(
    invoice: InvoiceEntity,
  ): Promise<CutLuyCheckout | null> {
    if (
      !invoice.pendingCutluyPaymentId ||
      !invoice.pendingCutluyPaymentExpiresAt ||
      invoice.pendingCutluyPaymentExpiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    try {
      const existing = await this.cutluy.getPayment(
        invoice.pendingCutluyPaymentId,
      );
      return { checkoutUrl: existing.checkoutUrl, qrString: existing.qrString };
    } catch (error) {
      this.logger.warn(
        `Couldn't reuse pending CutLuy payment ${invoice.pendingCutluyPaymentId} for invoice ${invoice.id}, creating a new one instead: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Maps each of the CutLuy error shapes the docs call out (401, 402, 403,
   * 429) to something the caller can actually act on, instead of letting
   * them propagate as an undifferentiated 500 — an admin retrying a 402
   * (quota exceeded, a real business state) needs a different message than
   * one retrying a 429 (rate limited, safe to retry after a delay), and
   * neither should see CutLuy's own wording for a 401/403, which describes
   * a problem with our account, not theirs.
   */
  private translateCutLuyError(error: unknown, invoiceId: string): Error {
    if (error instanceof CutLuyRateLimitedError) {
      return new ServiceUnavailableException({
        message: 'Payment provider is busy — try again shortly.',
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error instanceof CutLuyQuotaExceededError) {
      return new BadRequestException(
        "This school's payment account has reached its usage limit. Contact support to continue.",
      );
    }
    if (
      error instanceof CutLuyUnauthorizedError ||
      error instanceof CutLuyAccountSuspendedError
    ) {
      // Our own account/API-key problem, not the caller's — never surface
      // CutLuy's own wording for this to an admin; log it so an operator
      // notices instead.
      this.logger.error(
        `CutLuy rejected checkout for invoice ${invoiceId}: ${error.name} — ${error.message}`,
      );
      return new InternalServerErrorException(
        'Payments are temporarily unavailable. Please try again later.',
      );
    }
    return error instanceof Error ? error : new InternalServerErrorException();
  }
}
