import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StartSubscriptionHandler } from '../../../src/billing/application/commands/start-subscription.handler';
import { StartSubscriptionCommand } from '../../../src/billing/application/commands/start-subscription.command';
import {
  SubscriptionEntity,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../src/billing/infrastructure/entities/subscription.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';
import {
  StudentEntity,
  StudentStatus,
} from '../../../src/student/infrastructure/entities/student.entity';

describe('StartSubscriptionHandler', () => {
  let handler: StartSubscriptionHandler;
  let subscriptionRepo: { save: jest.Mock; findOneBy: jest.Mock };
  let invoiceRepo: { save: jest.Mock };
  let studentRepo: { count: jest.Mock };

  const SCHOOL_ID = 'school-1';

  beforeEach(async () => {
    subscriptionRepo = {
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    invoiceRepo = {
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    studentRepo = { count: jest.fn().mockResolvedValue(150) };

    const module = await Test.createTestingModule({
      providers: [
        StartSubscriptionHandler,
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionRepo,
        },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
      ],
    }).compile();

    handler = module.get(StartSubscriptionHandler);
  });

  it('creates an active Subscription scoped to the School', async () => {
    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );

    const [subscription] = subscriptionRepo.save.mock.calls[0] as [
      SubscriptionEntity,
    ];
    expect(subscription.schoolId).toBe(SCHOOL_ID);
    expect(subscription.plan).toBe(SubscriptionPlan.MONTHLY);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(
      subscription.currentPeriodStart.getTime(),
    );
  });

  it('sets the period to one month for a monthly plan and one year for annual', async () => {
    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );
    const [monthly] = subscriptionRepo.save.mock.calls[0] as [
      SubscriptionEntity,
    ];
    const monthlyDays =
      (monthly.currentPeriodEnd.getTime() -
        monthly.currentPeriodStart.getTime()) /
      (1000 * 60 * 60 * 24);
    expect(monthlyDays).toBeCloseTo(30, 0);

    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.ANNUAL),
    );
    const [annual] = subscriptionRepo.save.mock.calls[1] as [
      SubscriptionEntity,
    ];
    const annualDays =
      (annual.currentPeriodEnd.getTime() -
        annual.currentPeriodStart.getTime()) /
      (1000 * 60 * 60 * 24);
    expect(annualDays).toBeCloseTo(365, 0);
  });

  it("snapshots the School's active student count onto the first Invoice", async () => {
    studentRepo.count.mockResolvedValue(150);

    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );

    const [options] = studentRepo.count.mock.calls[0] as [
      { where: { status: StudentStatus } },
    ];
    expect(options.where.status).toBe(StudentStatus.ACTIVE);
    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.schoolId).toBe(SCHOOL_ID);
    expect(invoice.activeStudentCount).toBe(150);
    expect(invoice.status).toBe(InvoiceStatus.OPEN);
  });

  it('prices the Invoice at $0.10 per active student, in cents', async () => {
    studentRepo.count.mockResolvedValue(150);

    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );

    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.amountCents).toBe(1500);
  });

  it('links the Invoice to the Subscription it was created for', async () => {
    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );

    const [subscription] = subscriptionRepo.save.mock.calls[0] as [
      SubscriptionEntity,
    ];
    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.subscriptionId).toBe(subscription.id);
  });

  it('settles a $0 Invoice immediately for a School with no active students yet', async () => {
    studentRepo.count.mockResolvedValue(0);

    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );

    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.amountCents).toBe(0);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
  });

  it('rejects a School that already has a Subscription — a double-click on "Subscribe now" must not create two', async () => {
    subscriptionRepo.findOneBy.mockResolvedValue({
      id: 'existing-sub',
      schoolId: SCHOOL_ID,
      status: SubscriptionStatus.ACTIVE,
    });

    await expect(
      handler.execute(
        new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('dues the first Invoice immediately, not a period out', async () => {
    const before = Date.now();
    await handler.execute(
      new StartSubscriptionCommand(SCHOOL_ID, SubscriptionPlan.MONTHLY),
    );
    const after = Date.now();

    const [invoice] = invoiceRepo.save.mock.calls[0] as [InvoiceEntity];
    expect(invoice.dueAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(invoice.dueAt.getTime()).toBeLessThanOrEqual(after);
  });
});
