import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
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
 *
 * Everything after the initial Invoice lookup runs in one DB transaction —
 * the Payment row, the Invoice's PAID status, and the Subscription's
 * reactivation either all commit or none do. Without this, a crash between
 * any two of those writes (or the missing-Subscription branch below) could
 * leave a Payment recorded against an Invoice that's still OPEN, or an
 * Invoice marked PAID with its Subscription never reactivated — both
 * silently wrong. This is the first use of `DataSource.transaction` in this
 * codebase; nothing before this module needed one.
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
    private readonly dataSource: DataSource,
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

    // Unscoped by necessity, not oversight — schoolId isn't known until this
    // lookup resolves it, the same shape as verify-email.handler.ts. See
    // docs/adr/0010's "Lookups before a School is known" category.
    // eslint-disable-next-line local/require-scoped-repository
    const invoice = await this.invoiceRepository.findOneBy({
      id: command.invoiceId,
    });
    if (!invoice || invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException('Invoice is not open for payment');
    }

    const confirmedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      const invoices = new ScopedRepository(
        manager.getRepository(InvoiceEntity),
        invoice.schoolId,
      );
      const payments = new ScopedRepository(
        manager.getRepository(PaymentEntity),
        invoice.schoolId,
      );
      const subscriptions = new ScopedRepository(
        manager.getRepository(SubscriptionEntity),
        invoice.schoolId,
      );

      await payments.save({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        cutluyReference: command.cutluyReference,
        amountCents: invoice.amountCents,
        rawWebhookPayload: command.rawWebhookPayload,
        confirmedAt,
      });

      await invoices.update({ id: invoice.id }, { status: InvoiceStatus.PAID });

      // Every Invoice is created alongside the Subscription it belongs to
      // (StartSubscriptionHandler, GenerateRenewalInvoicesHandler) — a
      // missing row here means the data is inconsistent, not that this is a
      // normal state to shrug off. Throwing rolls back the Payment and
      // Invoice writes above along with it: better an Invoice that's still
      // cleanly OPEN (retryable — CutLuy redelivers, or an ops action can
      // retry) than a Payment recorded against a broken Subscription link.
      const subscription = await subscriptions.findOneBy({
        id: invoice.subscriptionId,
      });
      if (!subscription) {
        throw new InternalServerErrorException(
          `Invoice ${invoice.id} references Subscription ${invoice.subscriptionId}, which does not exist`,
        );
      }
      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        await subscriptions.update(
          { id: subscription.id },
          { status: SubscriptionStatus.ACTIVE },
        );
      }
    });
  }
}
