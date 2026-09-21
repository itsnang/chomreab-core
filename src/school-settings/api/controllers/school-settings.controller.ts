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
import { SchoolSettingsService } from '../../application/services/school-settings.service';
import { SchoolSettingsEntity } from '../../infrastructure/entities/school-settings.entity';

@ApiTags('school-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('school-settings')
export class SchoolSettingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly schoolSettingsService: SchoolSettingsService,
  ) {}

  @ApiOperation({ summary: 'Get the school settings (admin only)' })
  @Get()
  async get(@CurrentSchoolId() schoolId: string) {
    const settings = await this.queryBus.execute<
      GetSchoolSettingsQuery,
      SchoolSettingsEntity
    >(new GetSchoolSettingsQuery(schoolId));
    // The shared bot's @username (ADR-0007) is deployment config, not part of
    // the School row — merged on here rather than in the query handler, which
    // has no other reason to depend on ConfigService.
    return {
      ...settings,
      botUsername: this.schoolSettingsService.getBotUsername() ?? null,
    };
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
