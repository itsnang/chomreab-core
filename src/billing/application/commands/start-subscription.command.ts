import { SubscriptionPlan } from '../../infrastructure/entities/subscription.entity';

export class StartSubscriptionCommand {
  constructor(
    public readonly schoolId: string,
    public readonly plan: SubscriptionPlan,
  ) {}
}
