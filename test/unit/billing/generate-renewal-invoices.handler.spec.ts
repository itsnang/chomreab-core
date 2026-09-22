import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GenerateRenewalInvoicesHandler } from '../../../src/billing/application/commands/generate-renewal-invoices.handler';
import { GenerateRenewalInvoicesCommand } from '../../../src/billing/application/commands/generate-renewal-invoices.command';
import {
  SubscriptionEntity,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../src/billing/infrastructure/entities/subscription.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';

describe('GenerateRenewalInvoicesHandler', () => {
  let handler: GenerateRenewalInvoicesHandler;
  let subscriptionRepo: { find: jest.Mock; update: jest.Mock };
  let invoiceRepo: { save: jest.Mock };
  let studentRepo: { count: jest.Mock };

  const NOW = new Date('2026-03-01T00:00:00Z');

  const ACTIVE_SUBSCRIPTION = {
    id: 'sub-1',
    schoolId: 'school-1',
    plan: SubscriptionPlan.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date('2026-01-30T00:00:00Z'),
    currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
  };

  beforeEach(async () => {
    subscriptionRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    invoiceRepo = {
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    studentRepo = { count: jest.fn().mockResolvedValue(150) };

    const module = await Test.createTestingModule({
      providers: [
        GenerateRenewalInvoicesHandler,
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionRepo,
        },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
      ],
    }).compile();

    handler = module.get(GenerateRenewalInvoicesHandler);
  });

  it('only looks at active Subscriptions whose current period has ended', async () => {
    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));
    const [options] = subscriptionRepo.find.mock.calls[0] as [
      { where: { status: string } },
    ];
    expect(options.where.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('issues a new Invoice for the fresh period, snapshotting the current active student count', async () => {
    subscriptionRepo.find.mockResolvedValue([{ ...ACTIVE_SUBSCRIPTION }]);
    studentRepo.count.mockResolvedValue(200);

    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));

    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.subscriptionId).toBe('sub-1');
    expect(invoice.schoolId).toBe('school-1');
    expect(invoice.activeStudentCount).toBe(200);
    expect(invoice.amountCents).toBe(2000);
    expect(invoice.status).toBe(InvoiceStatus.OPEN);
    expect(invoice.dueAt).toEqual(NOW);
  });

  it("settles a $0 renewal Invoice immediately, same as a School's first Invoice", async () => {
    subscriptionRepo.find.mockResolvedValue([{ ...ACTIVE_SUBSCRIPTION }]);
    studentRepo.count.mockResolvedValue(0);

    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));

    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.amountCents).toBe(0);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
  });

  it('rolls the Subscription to its next period, one month out for a monthly plan', async () => {
    subscriptionRepo.find.mockResolvedValue([{ ...ACTIVE_SUBSCRIPTION }]);

    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      { id: 'sub-1', schoolId: 'school-1' },
      {
        currentPeriodStart: ACTIVE_SUBSCRIPTION.currentPeriodEnd,
        currentPeriodEnd: new Date('2026-03-31T00:00:00Z'),
      },
    );
  });

  it('rolls an annual plan a full year out', async () => {
    subscriptionRepo.find.mockResolvedValue([
      { ...ACTIVE_SUBSCRIPTION, plan: SubscriptionPlan.ANNUAL },
    ]);

    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      { id: 'sub-1', schoolId: 'school-1' },
      {
        currentPeriodStart: ACTIVE_SUBSCRIPTION.currentPeriodEnd,
        currentPeriodEnd: new Date('2027-03-01T00:00:00Z'),
      },
    );
  });

  it('does nothing when no Subscription has reached the end of its period', async () => {
    await handler.execute(new GenerateRenewalInvoicesCommand(NOW));
    expect(invoiceRepo.save).not.toHaveBeenCalled();
    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });
});
