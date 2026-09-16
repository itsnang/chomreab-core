import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { UpdateSchoolSettingsDto } from '../dto/update-school-settings.dto';
import { GetSchoolSettingsQuery } from '../../application/queries/get-school-settings.query';
import { UpdateSchoolSettingsCommand } from '../../application/commands/update-school-settings.command';
import { GetTelegramStatusQuery } from '../../application/queries/get-telegram-status.query';
import { RegisterTelegramWebhookCommand } from '../../application/commands/register-telegram-webhook.command';

@ApiTags('school-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('school-settings')
export class SchoolSettingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'Get the school settings (admin only)' })
  @Get()
  get() {
    return this.queryBus.execute(new GetSchoolSettingsQuery());
  }

  @ApiOperation({ summary: 'Update the school settings (admin only)' })
  @Patch()
  update(@Body() dto: UpdateSchoolSettingsDto) {
    return this.commandBus.execute(
      new UpdateSchoolSettingsCommand(
        dto.school_name,
        dto.late_cutoff_minutes,
        dto.absence_message_template,
        dto.telegram_bot_token ?? null,
      ),
    );
  }

  @ApiOperation({
    summary: 'What webhook Telegram actually holds for this bot (admin only)',
  })
  @Get('telegram-status')
  telegramStatus() {
    return this.queryBus.execute(new GetTelegramStatusQuery());
  }

  @ApiOperation({
    summary: "Re-point the saved bot's webhook at this deployment (admin only)",
  })
  @Post('telegram-webhook')
  registerTelegramWebhook() {
    return this.commandBus.execute(new RegisterTelegramWebhookCommand());
  }
}
