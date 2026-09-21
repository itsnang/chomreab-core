import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { StartSubscriptionCommand } from './start-subscription.command';
import { PERIOD_DAYS, RATE_CENTS_PER_STUDENT } from '../../domain/pricing';

/**
 * Creates a Subscription and its first Invoice together — see
 * CONTEXT.md's "Subscription" entry for why a Subscription with no Invoice
 * behind it is not a state this domain allows. Called from wherever a School
 * decides to start paying (Phase 3's CutLuy checkout initiation calls this
 * before redirecting); nothing here talks to a payment gateway.
 *
 * Does not check for an existing Subscription — a School reaching this
 * command twice (a double-click, a retried request) is a caller bug to fix
 * at the call site, not a case this handler silently absorbs.
 */
@Injectable()
@CommandHandler(StartSubscriptionCommand)
export class StartSubscriptionHandler implements ICommandHandler<
  StartSubscriptionCommand,
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

  async execute(command: StartSubscriptionCommand): Promise<void> {
    const subscriptions = new ScopedRepository(
      this.subscriptionRepository,
      command.schoolId,
    );
    const students = new ScopedRepository(
      this.studentRepository,
      command.schoolId,
    );
    const invoices = new ScopedRepository(
      this.invoiceRepository,
      command.schoolId,
    );

    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + PERIOD_DAYS[command.plan] * 24 * 60 * 60 * 1000,
    );

    const subscriptionId = crypto.randomUUID();
    await subscriptions.save({
      id: subscriptionId,
      plan: command.plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    const activeStudentCount = await students.count({
      where: { status: StudentStatus.ACTIVE },
    });
    const amountCents = activeStudentCount * RATE_CENTS_PER_STUDENT;

    await invoices.save({
      id: crypto.randomUUID(),
      subscriptionId,
      activeStudentCount,
      amountCents,
      dueAt: now,
      // A School with no active students yet (the common case immediately
      // after signup, before a roster exists) owes nothing — settle the
      // Invoice on the spot rather than leaving it open. An open $0 Invoice
      // would otherwise ride the same due-date clock as a real bill and
      // TransitionOverdueInvoicesHandler would eventually lapse a School
      // for non-payment of a debt that was never owed.
      status: amountCents === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
    });
  }
}
