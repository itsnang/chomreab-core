import { SubscriptionPlan } from '../infrastructure/entities/subscription.entity';

/** $0.10 per active student per month, in cents — see the landing page's
 *  Price section, which this must stay in sync with. An annual Subscription
 *  is still billed one Invoice at a time (nothing here generates a 12-month
 *  lump sum); the discount is applied when that Invoice is issued, not
 *  encoded here.
 *
 *  Shared by StartSubscriptionHandler (the first Invoice) and
 *  GenerateRenewalInvoicesHandler (every one after) — one source of truth so
 *  the two can't drift out of sync with each other or with the landing page. */
export const RATE_CENTS_PER_STUDENT = 10;

export const PERIOD_DAYS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.MONTHLY]: 30,
  [SubscriptionPlan.ANNUAL]: 365,
};
