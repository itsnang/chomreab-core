import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../infrastructure/entities/invoice.entity';
import {
  SubscriptionEntity,
  SubscriptionStatus,
} from '../../infrastructure/entities/subscription.entity';
import { TransitionOverdueInvoicesCommand } from './transition-overdue-invoices.command';

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Walks every open, overdue Invoice and advances its Subscription through
 * active -> in_grace -> lapsed, per CONTEXT.md's "Grace period" and "Lapsed"
 * entries. The Invoice itself never changes status here — it stays `open`
 * until MarkInvoicePaidHandler settles it or someone voids it; only
 * `Subscription.status` moves.
 *
 * Fired daily by a `@Cron` job (see billing.module.ts) with the real clock;
 * every other caller is a test driving it with a fixed `now`.
 */
@Injectable()
@CommandHandler(TransitionOverdueInvoicesCommand)
export class TransitionOverdueInvoicesHandler implements ICommandHandler<
  TransitionOverdueInvoicesCommand,
  void
> {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
  ) {}

  async execute(command: TransitionOverdueInvoicesCommand): Promise<void> {
    // Deliberately cross-tenant: this is the daily cron walking every
    // School's overdue Invoices, not a request scoped to one. See
    // docs/adr/0010's "Deliberately cross-tenant by design" category.
    // eslint-disable-next-line local/require-scoped-repository
    const overdueInvoices = await this.invoiceRepository.find({
      where: { status: InvoiceStatus.OPEN, dueAt: LessThan(command.now) },
    });
    if (overdueInvoices.length === 0) return;

    // A Subscription in this codebase never carries more than one open
    // overdue Invoice at once (StartSubscriptionHandler issues exactly one
    // per period), but de-duplicating here costs nothing and means a future
    // renewal-invoice generator can't silently start double-updating.
    const subscriptionIds = [
      ...new Set(overdueInvoices.map((i) => i.subscriptionId)),
    ];
    // Batched by a list of primary keys already resolved from the
    // cross-tenant scan above — structurally moot to scope further, per
    // docs/adr/0010's "keyed by a globally-unique primary key" category.
    // eslint-disable-next-line local/require-scoped-repository
    const subscriptions = await this.subscriptionRepository.find({
      where: { id: In(subscriptionIds) },
    });
    const oldestOverdueBySubscription = new Map<string, Date>();
    for (const invoice of overdueInvoices) {
      const seen = oldestOverdueBySubscription.get(invoice.subscriptionId);
      if (!seen || invoice.dueAt < seen) {
        oldestOverdueBySubscription.set(invoice.subscriptionId, invoice.dueAt);
      }
    }

    for (const subscription of subscriptions) {
      const dueAt = oldestOverdueBySubscription.get(subscription.id);
      if (!dueAt) continue;

      const overdueMs = command.now.getTime() - dueAt.getTime();
      const nextStatus = this.nextStatus(subscription.status, overdueMs);
      if (nextStatus && nextStatus !== subscription.status) {
        const subscriptions = new ScopedRepository(
          this.subscriptionRepository,
          subscription.schoolId,
        );
        await subscriptions.update(
          { id: subscription.id },
          { status: nextStatus },
        );
      }
    }
  }

  /**
   * Checks `overdueMs` against the grace window on every call, including
   * from ACTIVE — not just from IN_GRACE. The cron fires daily, but a missed
   * run (a deploy, a downed box) can leave an ACTIVE subscription's invoice
   * 20 days overdue by the time this next executes; without this check it
   * would only step to IN_GRACE that run and need a second run to reach
   * LAPSED, silently extending the 7-day grace period by however long the
   * cron was down.
   */
  private nextStatus(
    current: SubscriptionStatus,
    overdueMs: number,
  ): SubscriptionStatus | null {
    if (current === SubscriptionStatus.LAPSED) return null;
    return overdueMs >= GRACE_PERIOD_MS
      ? SubscriptionStatus.LAPSED
      : SubscriptionStatus.IN_GRACE;
  }
}
