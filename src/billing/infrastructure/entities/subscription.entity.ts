import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export enum SubscriptionPlan {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  IN_GRACE = 'in_grace',
  LAPSED = 'lapsed',
}

/**
 * See CONTEXT.md's "Subscription" entry. Created by StartSubscriptionHandler
 * alongside the first Invoice for its period — there is no Subscription row
 * with no Invoice behind it, and no School has more than one at a time.
 */
@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'enum', enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ type: 'timestamptz' })
  currentPeriodEnd: Date;

  @CreateDateColumn()
  createdAt: Date;
}
