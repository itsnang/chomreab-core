import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export enum InvoiceStatus {
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
}

/**
 * See CONTEXT.md's "Invoice" entry. `activeStudentCount` and `amountCents`
 * are a snapshot taken when this row is created — a School growing or
 * shrinking afterward never rewrites an issued Invoice, only the next one.
 * `amountCents` avoids float rounding on money; see RATE_CENTS_PER_STUDENT
 * in start-subscription.handler.ts for how it's computed.
 */
@Entity('invoices')
export class InvoiceEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  subscriptionId: string;

  @Column({ type: 'int' })
  activeStudentCount: number;

  @Column({ type: 'int' })
  amountCents: number;

  @Column({ type: 'timestamptz' })
  dueAt: Date;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status: InvoiceStatus;

  @CreateDateColumn()
  createdAt: Date;
}
