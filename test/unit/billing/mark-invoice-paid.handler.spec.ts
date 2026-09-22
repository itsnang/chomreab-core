import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
  let invoiceRepo: { findOneBy: jest.Mock };
  let txInvoiceRepo: { update: jest.Mock };
  let txPaymentRepo: { save: jest.Mock };
  let txSubscriptionRepo: { findOneBy: jest.Mock; update: jest.Mock };
  let dataSource: { transaction: jest.Mock };

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
    };
    txInvoiceRepo = { update: jest.fn().mockResolvedValue(undefined) };
    txPaymentRepo = {
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    txSubscriptionRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'sub-1',
        schoolId: 'school-1',
        status: SubscriptionStatus.ACTIVE,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    // The handler builds a fresh ScopedRepository from `manager.getRepository`
    // inside the transaction callback, once per entity — this mock manager
    // hands back the same three mocks every time, keyed by entity class, so
    // assertions below inspect them directly rather than a real EntityManager.
    const managerMock = {
      getRepository: (entity: unknown) => {
        if (entity === InvoiceEntity) return txInvoiceRepo;
        if (entity === PaymentEntity) return txPaymentRepo;
        if (entity === SubscriptionEntity) return txSubscriptionRepo;
        throw new Error(`unexpected entity in transaction: ${String(entity)}`);
      },
    };
    dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => Promise<void>) =>
        cb(managerMock),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        MarkInvoicePaidHandler,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: DataSource, useValue: dataSource },
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
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed invoiceId before ever querying the database — a uuid column would otherwise fail the query itself', async () => {
    // CutLuy's own "send test event" feature sends reference_id:
    // "test_reference", which is exactly this case — not a uuid at all.
    await expect(
      handler.execute(new MarkInvoicePaidCommand('test_reference')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(invoiceRepo.findOneBy).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an invoice that is not open', async () => {
    invoiceRepo.findOneBy.mockResolvedValue({
      ...OPEN_INVOICE,
      status: InvoiceStatus.PAID,
    });
    await expect(
      handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('wraps every write in a single database transaction', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('records a Payment for the exact Invoice amount, scoped to the same School', async () => {
    await handler.execute(
      new MarkInvoicePaidCommand(OPEN_INVOICE.id, 'cutluy-ref-1'),
    );

    const [payment] = txPaymentRepo.save.mock.calls[0] as [PaymentEntity];
    expect(payment.invoiceId).toBe(OPEN_INVOICE.id);
    // ScopedRepository.save force-sets schoolId from the School it's bound
    // to — not passed explicitly by the handler any more.
    expect(payment.schoolId).toBe(OPEN_INVOICE.schoolId);
    expect(payment.amountCents).toBe(OPEN_INVOICE.amountCents);
    expect(payment.cutluyReference).toBe('cutluy-ref-1');
    expect(payment.confirmedAt).toBeInstanceOf(Date);
  });

  it('defaults cutluyReference to null for the manual mark-paid path', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    const [payment] = txPaymentRepo.save.mock.calls[0] as [PaymentEntity];
    expect(payment.cutluyReference).toBeNull();
  });

  it('settles the Invoice', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    expect(txInvoiceRepo.update).toHaveBeenCalledWith(
      { id: OPEN_INVOICE.id, schoolId: OPEN_INVOICE.schoolId },
      expect.objectContaining({ status: InvoiceStatus.PAID }),
    );
  });

  it('reactivates a lapsed Subscription', async () => {
    txSubscriptionRepo.findOneBy.mockResolvedValue({
      id: 'sub-1',
      schoolId: 'school-1',
      status: SubscriptionStatus.LAPSED,
    });

    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));

    expect(txSubscriptionRepo.update).toHaveBeenCalledWith(
      { id: 'sub-1', schoolId: 'school-1' },
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });

  it('reactivates a Subscription in its grace period', async () => {
    txSubscriptionRepo.findOneBy.mockResolvedValue({
      id: 'sub-1',
      schoolId: 'school-1',
      status: SubscriptionStatus.IN_GRACE,
    });

    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));

    expect(txSubscriptionRepo.update).toHaveBeenCalledWith(
      { id: 'sub-1', schoolId: 'school-1' },
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });

  it('leaves an already-active Subscription alone rather than writing a redundant update', async () => {
    await handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id));
    expect(txSubscriptionRepo.update).not.toHaveBeenCalled();
  });

  it('throws when the Invoice points at a Subscription that does not exist, rolling back inside one transaction', async () => {
    txSubscriptionRepo.findOneBy.mockResolvedValue(null);

    await expect(
      handler.execute(new MarkInvoicePaidCommand(OPEN_INVOICE.id)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    // The mock manager can't simulate a real ROLLBACK — that guarantee comes
    // from wrapping everything in `dataSource.transaction`, which this
    // confirms was actually used. In production, a real Postgres transaction
    // undoes the Payment/Invoice writes below when this callback rejects;
    // nothing here should be read as "these writes are kept."
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
