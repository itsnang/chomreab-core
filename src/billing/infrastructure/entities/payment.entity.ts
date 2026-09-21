import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * See CONTEXT.md's "Payment" entry — only ever a completed transfer, never a
 * pending or failed attempt, so there is no `status` column: a Payment row
 * existing is itself the confirmation. `cutluyReference` is the webhook's
 * idempotency key (Phase 3) and stays nullable for the manual "mark paid"
 * path this phase tests against — Postgres allows any number of NULLs under
 * a unique index, so the two paths coexist without a sentinel value.
 */
@Entity('payments')
@Index(['cutluyReference'], { unique: true })
export class PaymentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoiceId: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'varchar', nullable: true })
  cutluyReference: string | null;

  @Column({ type: 'int' })
  amountCents: number;

  @Column({ type: 'jsonb', nullable: true })
  rawWebhookPayload: Record<string, unknown> | null;

  @Column({ type: 'timestamptz' })
  confirmedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
