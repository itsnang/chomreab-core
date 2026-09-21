import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../infrastructure/entities/invoice.entity';
import { PaymentEntity } from '../../infrastructure/entities/payment.entity';
import {
  SubscriptionEntity,
  SubscriptionStatus,
} from '../../infrastructure/entities/subscription.entity';
import { MarkInvoicePaidCommand } from './mark-invoice-paid.command';

/**
 * The one path this phase is unit-tested against before Phase 3 wires a real
 * gateway — see the plan's Phase 2 note. Looked up by invoiceId alone,
 * unscoped: same shape as verify-email.handler.ts, since there is no
 * authenticated request here either. A webhook (Phase 3) supplies its own
 * `cutluyReference`; this phase's callers pass none.
 *
 * Deliberately does not generate the Subscription's next-period Invoice —
 * that is a separate concern this phase leaves open. What it does guarantee,
 * per CONTEXT.md's "Lapsed" entry: paying the open Invoice is what reverses
 * a lapse, whatever the current status was on the way in.
 */
@Injectable()
@CommandHandler(MarkInvoicePaidCommand)
export class MarkInvoicePaidHandler implements ICommandHandler<
  MarkInvoicePaidCommand,
  void
> {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
  ) {}

  async execute(command: MarkInvoicePaidCommand): Promise<void> {
    // `id` is a uuid column — a malformed invoiceId (a CutLuy test webhook's
    // literal "test_reference" reference_id, or any other garbage a caller
    // might send) would otherwise reach findOneBy and fail as a raw
    // QueryFailedError from Postgres, which the webhook controller doesn't
    // know how to distinguish from a real failure and can't retry into
    // success. Checking the shape first turns it into the same
    // BadRequestException path a genuinely missing Invoice already takes.
    if (!isUUID(command.invoiceId)) {
      throw new BadRequestException('Invoice is not open for payment');
    }

    const invoice = await this.invoiceRepository.findOneBy({
      id: command.invoiceId,
    });
    if (!invoice || invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException('Invoice is not open for payment');
    }

    const confirmedAt = new Date();

    await this.paymentRepository.save({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      schoolId: invoice.schoolId,
      cutluyReference: command.cutluyReference,
      amountCents: invoice.amountCents,
      rawWebhookPayload: command.rawWebhookPayload,
      confirmedAt,
    });

    await this.invoiceRepository.update(invoice.id, {
      status: InvoiceStatus.PAID,
    });

    // Every Invoice is created alongside the Subscription it belongs to
    // (StartSubscriptionHandler, GenerateRenewalInvoicesHandler) — a missing
    // row here means the data is inconsistent, not that this is a normal
    // state to shrug off. Throwing surfaces that loudly instead of silently
    // leaving the Invoice paid but its Subscription never reactivated.
    const subscription = await this.subscriptionRepository.findOneBy({
      id: invoice.subscriptionId,
    });
    if (!subscription) {
      throw new InternalServerErrorException(
        `Invoice ${invoice.id} references Subscription ${invoice.subscriptionId}, which does not exist`,
      );
    }
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      await this.subscriptionRepository.update(subscription.id, {
        status: SubscriptionStatus.ACTIVE,
      });
    }
  }
}
