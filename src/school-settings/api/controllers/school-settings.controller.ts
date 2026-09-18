import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { UpdateSchoolSettingsDto } from '../dto/update-school-settings.dto';
import { GetSchoolSettingsQuery } from '../../application/queries/get-school-settings.query';
import { UpdateSchoolSettingsCommand } from '../../application/commands/update-school-settings.command';

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
  get(@CurrentSchoolId() schoolId: string) {
    return this.queryBus.execute(new GetSchoolSettingsQuery(schoolId));
  }

  @ApiOperation({ summary: 'Update the school settings (admin only)' })
  @Patch()
  update(
    @CurrentSchoolId() schoolId: string,
    @Body() dto: UpdateSchoolSettingsDto,
  ) {
    return this.commandBus.execute(
      new UpdateSchoolSettingsCommand(
        schoolId,
        dto.school_name,
        dto.late_cutoff_minutes,
        dto.absence_message_template,
      ),
    );
  }
}
