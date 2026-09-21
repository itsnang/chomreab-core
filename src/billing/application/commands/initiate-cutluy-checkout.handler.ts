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

    // A fresh key per attempt, not a fixed one derived from the Invoice —
    // see the test file for why: CONTEXT.md's Invoice entry expects more
    // than one payment attempt per Invoice, and reusing invoice.id forever
    // would make CutLuy treat a real second attempt as a duplicate of an
    // expired first one.
    try {
      const payment = await this.cutluy.createPayment({
        amountCents: invoice.amountCents,
        referenceId: invoice.id,
        metadata: { invoiceId: invoice.id, schoolId: invoice.schoolId },
        idempotencyKey: randomUUID(),
      });
      return { checkoutUrl: payment.checkoutUrl, qrString: payment.qrString };
    } catch (error) {
      throw this.translateCutLuyError(error, invoice.id);
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
