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

  // The most recent live CutLuy payment attempt for this Invoice, if any —
  // not a Payment row (payment.entity.ts is only ever a *confirmed*
  // transfer). InitiateCutLuyCheckoutHandler reuses this instead of minting
  // a new CutLuy payment while it's still unexpired, so a double-click on
  // "Pay now" can't leave two live payments open for the same Invoice —
  // CutLuy has no cancel/void endpoint, so avoiding a second one in the
  // first place is the only real fix. Cleared implicitly by simply going
  // stale once `pendingCutluyPaymentExpiresAt` passes; nothing needs to
  // null these out.
  @Column({ type: 'varchar', nullable: true })
  pendingCutluyPaymentId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  pendingCutluyPaymentExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
