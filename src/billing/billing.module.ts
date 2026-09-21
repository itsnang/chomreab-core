import { Injectable, Module } from '@nestjs/common';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionEntity } from './infrastructure/entities/subscription.entity';
import { InvoiceEntity } from './infrastructure/entities/invoice.entity';
import { PaymentEntity } from './infrastructure/entities/payment.entity';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { StartSubscriptionHandler } from './application/commands/start-subscription.handler';
import { MarkInvoicePaidHandler } from './application/commands/mark-invoice-paid.handler';
import { GenerateRenewalInvoicesHandler } from './application/commands/generate-renewal-invoices.handler';
import { GenerateRenewalInvoicesCommand } from './application/commands/generate-renewal-invoices.command';
import { TransitionOverdueInvoicesHandler } from './application/commands/transition-overdue-invoices.handler';
import { TransitionOverdueInvoicesCommand } from './application/commands/transition-overdue-invoices.command';
import { InitiateCutLuyCheckoutHandler } from './application/commands/initiate-cutluy-checkout.handler';
import { GetBillingStatusHandler } from './application/queries/get-billing-status.handler';
import { CutLuyClient } from './infrastructure/services/cutluy-client';
import { BillingController } from './api/controllers/billing.controller';
import { CutLuyWebhookController } from './api/controllers/cutluy-webhook.controller';

/** The only thing a `@Cron` decorator can usefully own is "when" — the state
 *  machine itself lives in the two handlers it calls, each driven by a fixed
 *  `now` in every test. This class exists solely to give the cron callback
 *  somewhere to live as an injectable, since Nest's scheduler needs a
 *  provider method, not a bare function.
 *
 *  Renewal runs first: a Subscription whose period ends exactly at this
 *  tick gets its next Invoice issued (due `now`), which
 *  TransitionOverdueInvoicesCommand's `dueAt < now` query correctly leaves
 *  alone on this same run — it only starts counting as overdue on a later
 *  tick, not the one that created it. */
@Injectable()
class DailyBillingScheduler {
  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async run(): Promise<void> {
    await this.commandBus.execute(new GenerateRenewalInvoicesCommand());
    await this.commandBus.execute(new TransitionOverdueInvoicesCommand());
  }
}

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      InvoiceEntity,
      PaymentEntity,
      StudentEntity,
    ]),
  ],
  controllers: [BillingController, CutLuyWebhookController],
  providers: [
    StartSubscriptionHandler,
    MarkInvoicePaidHandler,
    GenerateRenewalInvoicesHandler,
    TransitionOverdueInvoicesHandler,
    InitiateCutLuyCheckoutHandler,
    GetBillingStatusHandler,
    CutLuyClient,
    DailyBillingScheduler,
  ],
  // Nothing to export: CommandBus is a shared singleton once CqrsModule is
  // in the graph (every feature module imports it locally, same as here —
  // see school.module.ts), and command routing is global regardless of
  // which module registered the handler.
})
export class BillingModule {}
