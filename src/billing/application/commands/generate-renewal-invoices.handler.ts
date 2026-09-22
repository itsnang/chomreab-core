import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  StudentEntity,
  StudentStatus,
} from '../../../student/infrastructure/entities/student.entity';
import {
  SubscriptionEntity,
  SubscriptionStatus,
} from '../../infrastructure/entities/subscription.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../infrastructure/entities/invoice.entity';
import { PERIOD_DAYS, RATE_CENTS_PER_STUDENT } from '../../domain/pricing';
import { GenerateRenewalInvoicesCommand } from './generate-renewal-invoices.command';

/**
 * The other half of the state machine StartSubscriptionHandler only starts:
 * without this, a Subscription that pays its first Invoice sits ACTIVE
 * forever and is never billed again — nothing else in this module creates a
 * second Invoice. Fired by the same daily cron as
 * TransitionOverdueInvoicesHandler (see billing.module.ts).
 *
 * Only considers ACTIVE Subscriptions. IN_GRACE/LAPSED ones already have an
 * unpaid open Invoice from a prior period — this never piles a second bill
 * on top of one that's already overdue; MarkInvoicePaidHandler settling that
 * Invoice is what reactivates the Subscription and lets its next renewal
 * fire on a later run.
 */
@Injectable()
@CommandHandler(GenerateRenewalInvoicesCommand)
export class GenerateRenewalInvoicesHandler implements ICommandHandler<
  GenerateRenewalInvoicesCommand,
  void
> {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: GenerateRenewalInvoicesCommand): Promise<void> {
    // Deliberately cross-tenant: this is the daily cron scanning every
    // School for a due renewal, not a request scoped to one. See
    // docs/adr/0010's "Deliberately cross-tenant by design" category.
    // eslint-disable-next-line local/require-scoped-repository
    const dueSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: LessThanOrEqual(command.now),
      },
    });

    for (const subscription of dueSubscriptions) {
      const students = new ScopedRepository(
        this.studentRepository,
        subscription.schoolId,
      );
      const invoices = new ScopedRepository(
        this.invoiceRepository,
        subscription.schoolId,
      );

      const activeStudentCount = await students.count({
        where: { status: StudentStatus.ACTIVE },
      });
      const amountCents = activeStudentCount * RATE_CENTS_PER_STUDENT;

      await invoices.save({
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        activeStudentCount,
        amountCents,
        dueAt: command.now,
        status: amountCents === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
      });

      const periodDays = PERIOD_DAYS[subscription.plan];
      const currentPeriodEnd = new Date(
        subscription.currentPeriodEnd.getTime() +
          periodDays * 24 * 60 * 60 * 1000,
      );
      const subscriptions = new ScopedRepository(
        this.subscriptionRepository,
        subscription.schoolId,
      );
      await subscriptions.update(
        { id: subscription.id },
        {
          currentPeriodStart: subscription.currentPeriodEnd,
          currentPeriodEnd,
        },
      );
    }
  }
}
