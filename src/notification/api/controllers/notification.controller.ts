import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { SendNotificationDto } from '../dto/send-notification.dto';
import { SendNotificationCommand } from '../../application/commands/send-notification.command';

@ApiTags('admin/notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/notifications')
export class NotificationController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({ summary: 'Send a custom Telegram notification (admin only)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @Post('send')
  send(@Body() dto: SendNotificationDto) {
    return this.commandBus.execute(
      new SendNotificationCommand(dto.chat_id, dto.message),
    );
  }
}
