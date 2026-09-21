import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarkInvoicePaidHandler } from '../../../src/billing/application/commands/mark-invoice-paid.handler';
import { MarkInvoicePaidCommand } from '../../../src/billing/application/commands/mark-invoice-paid.command';
import {
  InvoiceEntity,
  InvoiceStatus,
} from '../../../src/billing/infrastructure/entities/invoice.entity';
import { PaymentEntity } from '../../../src/billing/infrastructure/entities/payment.entity';
import {
  SubscriptionEntity,
  SubscriptionStatus,
} from '../../../src/billing/infrastructure/entities/subscription.entity';

describe('MarkInvoicePaidHandler', () => {
  let handler: MarkInvoicePaidHandler;
  let invoiceRepo: { findOneBy: jest.Mock; update: jest.Mock };
  let paymentRepo: { save: jest.Mock };
  let subscriptionRepo: { findOneBy: jest.Mock; update: jest.Mock };

  const OPEN_INVOICE = {
    id: 'a1b2c3d4-e5f6-4789-a123-456789abcdef',
    schoolId: 'school-1',
    subscriptionId: 'sub-1',
    activeStudentCount: 150,
    amountCents: 1500,
    dueAt: new Date('2026-01-01'),
    status: InvoiceStatus.OPEN,
  };

  beforeEach(async () => {
    invoiceRepo = {
      findOneBy: jest.fn().mockResolvedValue({ ...OPEN_INVOICE }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    paymentRepo = {
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    subscriptionRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'sub-1',
        schoolId: 'school-1',
        status: SubscriptionStatus.ACTIVE,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        MarkInvoicePaidHandler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(PaymentEntity), useValue: paymentRepo },
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionRepo,
        },
      ],
    }).compile();

    handler = module.get(MarkInvoicePaidHandler);
  });

  it('rejects an invoice that does not exist', async () => {
    invoiceRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(
        new MarkInvoicePaidCommand('99999999-9999-4999-8999-999999999999'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a malformed invoiceId before ever querying the database — a uuid column would otherwise fail the query itself', async () => {
    // CutLuy's own "send test event" feature sends reference_id:
    // "test_reference", which is exactly this case — not a uuid at all.
    await expect(
      handler.execute(new MarkInvoicePaidCommand('test_reference')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(invoiceRepo.findOneBy).not.toHaveBeenCalled();
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an invoice that is not open', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      status: InvoiceStatus.PAID,
    });
    await expect(
      handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('records a Payment for the exact Invoice amount, scoped to the same School', async () => {
    await handler.execute(
      new MarkInvoicePaidCommand(OPEN_INVOICE.id, 'cutluy-ref-1'),
    );

    const [payment] = paymentRepo.save.mock.calls[0] as [PaymentEntity];
    expect(payment.invoiceId).toBe(OPEN_INVOICE.id);
    expect(payment.schoolId).toBe(OPEN_INVOICE.schoolId);
    expect(payment.amountCents).toBe(OPEN_INVOICE.amountCents);
    expect(payment.cutluyReference).toBe('cutluy-ref-1');
    expect(payment.confirmedAt).toBeInstanceOf(Date);
  });

  it('defaults cutluyReference to null for the manual mark-paid path', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    const [payment] = paymentRepo.save.mock.calls[0] as [PaymentEntity];
    expect(payment.cutluyReference).toBeNull();
  });

  it('settles the Invoice', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    expect(invoiceRepo.update).toHaveBeenCalledWith(
      OPEN_INVOICE.id,
      expect.objectContaining({ status: InvoiceStatus.PAID }),
    );
  });

  it('reactivates a lapsed Subscription', async () => {
    subscriptionRepo.findOneBy.mockResolvedValue({
      id: 'sub-1',
      schoolId: 'school-1',
      status: SubscriptionStatus.LAPSED,
    });

    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });

  it('reactivates a Subscription in its grace period', async () => {
    subscriptionRepo.findOneBy.mockResolvedValue({
      id: 'sub-1',
      schoolId: 'school-1',
      status: SubscriptionStatus.IN_GRACE,
    });

    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });

  it('leaves an already-active Subscription alone rather than writing a redundant update', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });

  it('throws rather than silently skipping when the Invoice points at a Subscription that does not exist', async () => {
    subscriptionRepo.findOneBy.mockResolvedValue(null);

    await expect(
      handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    // The Payment and Invoice settlement already happened — this failure is
    // about the orphaned Subscription reference, not about undoing money
    // already recorded as paid.
    expect(paymentRepo.save).toHaveBeenCalled();
    expect(invoiceRepo.update).toHaveBeenCalled();
  });
});
