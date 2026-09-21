import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransitionOverdueInvoicesHandler } from '../../../src/billing/application/commands/transition-overdue-invoices.handler';
import { TransitionOverdueInvoicesCommand } from '../../../src/billing/application/commands/transition-overdue-invoices.command';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';
import {
  SubscriptionEntity,
  SubscriptionStatus,
} from '../../../src/billing/infrastructure/entities/subscription.entity';

describe('TransitionOverdueInvoicesHandler', () => {
  let handler: TransitionOverdueInvoicesHandler;
  let invoiceRepo: { find: jest.Mock };
  let subscriptionRepo: { find: jest.Mock; update: jest.Mock };

  const NOW = new Date('2026-02-01T00:00:00Z');
  const daysAgo = (days: number) =>
    new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    invoiceRepo = { find: jest.fn().mockResolvedValue([]) };
    subscriptionRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        TransitionOverdueInvoicesHandler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionRepo,
        },
      ],
    }).compile();

    handler = module.get(TransitionOverdueInvoicesHandler);
  });

  it('only looks at open invoices past their due date', async () => {
    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));
    const [options] = invoiceRepo.find.mock.calls[0] as [
      { where: { status: string } },
    ];
    expect(options.where.status).toBe(InvoiceStatus.OPEN);
  });

  it('moves an active Subscription to in_grace the day its Invoice goes overdue', async () => {
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(1),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.ACTIVE },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith('sub-1', {
      status: SubscriptionStatus.IN_GRACE,
    });
  });

  it('lapses an active Subscription directly when the cron missed enough runs to skip past grace entirely', async () => {
    // Simulates a cron outage: the job's last successful run was long enough
    // ago that an ACTIVE subscription's invoice is already 20 days overdue,
    // far past the 7-day grace window, by the time this run happens.
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(20),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.ACTIVE },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith('sub-1', {
      status: SubscriptionStatus.LAPSED,
    });
    expect(subscriptionRepo.update).toHaveBeenCalledTimes(1);
  });

  it('leaves a Subscription in_grace before day 7', async () => {
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(6),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.IN_GRACE },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });

  it('lapses a Subscription once its grace period passes day 7', async () => {
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(8),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.IN_GRACE },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith('sub-1', {
      status: SubscriptionStatus.LAPSED,
    });
  });

  it('does nothing to a Subscription that has already lapsed', async () => {
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(30),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.LAPSED },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });

  it('processes multiple overdue Subscriptions independently', async () => {
    invoiceRepo.find.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        dueAt: daysAgo(1),
        status: InvoiceStatus.OPEN,
      },
      {
        id: 'inv-2',
        subscriptionId: 'sub-2',
        dueAt: daysAgo(8),
        status: InvoiceStatus.OPEN,
      },
    ]);
    subscriptionRepo.find.mockResolvedValue([
      { id: 'sub-1', status: SubscriptionStatus.ACTIVE },
      { id: 'sub-2', status: SubscriptionStatus.IN_GRACE },
    ]);

    await handler.execute(new TransitionOverdueInvoicesCommand(NOW));

    expect(subscriptionRepo.update).toHaveBeenCalledWith('sub-1', {
      status: SubscriptionStatus.IN_GRACE,
    });
    expect(subscriptionRepo.update).toHaveBeenCalledWith('sub-2', {
      status: SubscriptionStatus.LAPSED,
    });
    expect(subscriptionRepo.update).toHaveBeenCalledTimes(2);
  });
});
