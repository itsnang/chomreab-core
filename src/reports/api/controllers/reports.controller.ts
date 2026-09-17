import { Controller, Get, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { getSchoolToday } from '../../../shared/utils/school-date.util';
import { GetReportsSummaryQuery } from '../../application/queries/get-reports-summary.query';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @ApiOperation({
    summary: 'Attendance report summary for the last 20 days (admin only)',
  })
  @Get('summary')
  summary(@CurrentSchoolId() schoolId: string) {
    return this.queryBus.execute(
      new GetReportsSummaryQuery(schoolId, getSchoolToday()),
    );
  }
}
