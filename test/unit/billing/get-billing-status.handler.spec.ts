import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetBillingStatusHandler } from '../../../src/billing/application/queries/get-billing-status.handler';
import { GetBillingStatusQuery } from '../../../src/billing/application/queries/get-billing-status.query';
import { SubscriptionEntity } from '../../../src/billing/infrastructure/entities/subscription.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';

describe('GetBillingStatusHandler', () => {
  let handler: GetBillingStatusHandler;
  let subscriptionRepo: { find: jest.Mock };
  let invoiceRepo: { find: jest.Mock };

  beforeEach(async () => {
    subscriptionRepo = { find: jest.fn().mockResolvedValue([]) };
    invoiceRepo = { find: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        GetBillingStatusHandler,
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionRepo,
        },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
      ],
    }).compile();

    handler = module.get(GetBillingStatusHandler);
  });

  it('returns both null when the School has no Subscription yet', async () => {
    const result = await handler.execute(new GetBillingStatusQuery('school-1'));
    expect(result).toEqual({ subscription: null, openInvoice: null });
  });

  it("scopes both lookups to the caller's own School", async () => {
    await handler.execute(new GetBillingStatusQuery('school-1'));
    expect(subscriptionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-1' } }),
    );
    expect(invoiceRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: InvoiceStatus.OPEN, schoolId: 'school-1' },
      }),
    );
  });

  it('returns the most recently created Subscription', async () => {
    subscriptionRepo.find.mockResolvedValue([{ id: 'sub-2' }]);
    const result = await handler.execute(new GetBillingStatusQuery('school-1'));
    expect(result.subscription).toEqual({ id: 'sub-2' });
    expect(subscriptionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'DESC' }, take: 1 }),
    );
  });

  it('returns the earliest-due open Invoice', async () => {
    invoiceRepo.find.mockResolvedValue([{ id: 'invoice-1' }]);
    const result = await handler.execute(new GetBillingStatusQuery('school-1'));
    expect(result.openInvoice).toEqual({ id: 'invoice-1' });
    expect(invoiceRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { dueAt: 'ASC' }, take: 1 }),
    );
  });

  it('never returns a Subscription or Invoice from a different School', async () => {
    await handler.execute(new GetBillingStatusQuery('school-a'));
    const [subCall] = subscriptionRepo.find.mock.calls[0] as [
      { where: { schoolId: string } },
    ];
    const [invCall] = invoiceRepo.find.mock.calls[0] as [
      { where: { schoolId: string } },
    ];
    expect(subCall.where.schoolId).toBe('school-a');
    expect(invCall.where.schoolId).toBe('school-a');
  });
});
