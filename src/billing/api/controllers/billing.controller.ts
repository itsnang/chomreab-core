import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { InitiateCutLuyCheckoutCommand } from '../../application/commands/initiate-cutluy-checkout.command';
import type { CutLuyCheckout } from '../../application/commands/initiate-cutluy-checkout.handler';
import { StartSubscriptionCommand } from '../../application/commands/start-subscription.command';
import { GetBillingStatusQuery } from '../../application/queries/get-billing-status.query';
import type { BillingStatus } from '../../application/queries/get-billing-status.handler';
import { StartSubscriptionDto } from '../dto/start-subscription.dto';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({
    summary:
      "Read the School's current Subscription and earliest open Invoice, if any (admin only)",
  })
  @Get('status')
  status(@CurrentSchoolId() schoolId: string): Promise<BillingStatus> {
    return this.queryBus.execute<GetBillingStatusQuery, BillingStatus>(
      new GetBillingStatusQuery(schoolId),
    );
  }

  @ApiOperation({
    summary:
      "Start the School's Subscription — its first Invoice is created in the same call (admin only)",
    description:
      "See CONTEXT.md's Trial/Subscription entries: a School has no Subscription until it actively converts, whenever its admin chooses to (during or after the 30-day trial). Fails if a Subscription already exists — this is a one-time conversion, not idempotent.",
  })
  @Post('subscribe')
  subscribe(
    @CurrentSchoolId() schoolId: string,
    @Body() dto: StartSubscriptionDto,
  ): Promise<void> {
    return this.commandBus.execute<StartSubscriptionCommand, void>(
      new StartSubscriptionCommand(schoolId, dto.plan),
    );
  }

  @ApiOperation({
    summary: 'Start a CutLuy checkout for an open Invoice (admin only)',
    description:
      "Returns where to send the payer — CutLuy's hosted checkout_url, and the qr_string to render directly. Confirmation of payment only ever comes from the CutLuy webhook, never from this call succeeding.",
  })
  @Post('invoices/:id/checkout')
  checkout(
    @CurrentSchoolId() schoolId: string,
    @Param('id') invoiceId: string,
  ): Promise<CutLuyCheckout> {
    return this.commandBus.execute<
      InitiateCutLuyCheckoutCommand,
      CutLuyCheckout
    >(new InitiateCutLuyCheckoutCommand(schoolId, invoiceId));
  }
}
