import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../infrastructure/entities/invoice.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { GetBillingStatusQuery } from './get-billing-status.query';

export interface BillingStatus {
  subscription: SubscriptionEntity | null;
  openInvoice: InvoiceEntity | null;
}

/**
 * Read model for the admin billing screen: the School's current Subscription
 * (if StartSubscriptionHandler has ever run for it) and its earliest still-
 * open Invoice, if any. Ordered by dueAt rather than assuming there is ever
 * only one open Invoice at a time — nothing in this module enforces that as
 * an invariant, so a read path shouldn't either.
 */
@Injectable()
@QueryHandler(GetBillingStatusQuery)
export class GetBillingStatusHandler implements IQueryHandler<
  GetBillingStatusQuery,
  BillingStatus
> {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
  ) {}

  async execute(query: GetBillingStatusQuery): Promise<BillingStatus> {
    const subscriptions = new ScopedRepository(
      this.subscriptionRepository,
      query.schoolId,
    );
    const invoices = new ScopedRepository(
      this.invoiceRepository,
      query.schoolId,
    );

    const [subscription] = await subscriptions.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const [openInvoice] = await invoices.find({
      where: { status: InvoiceStatus.OPEN },
      order: { dueAt: 'ASC' },
      take: 1,
    });

    return {
      subscription: subscription ?? null,
      openInvoice: openInvoice ?? null,
    };
  }
}
