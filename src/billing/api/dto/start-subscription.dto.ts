import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubscriptionPlan } from '../../infrastructure/entities/subscription.entity';

export class StartSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan, default: SubscriptionPlan.MONTHLY })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}
