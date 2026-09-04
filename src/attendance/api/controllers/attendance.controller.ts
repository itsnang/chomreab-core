import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { MarkAttendanceDto } from '../dto/mark-attendance.dto';
import { BulkMarkAttendanceDto } from '../dto/bulk-mark-attendance.dto';
import { GetRosterDto } from '../dto/get-roster.dto';
import { GetMyClassesDto } from '../dto/get-my-classes.dto';
import { MarkAttendanceCommand } from '../../application/commands/mark-attendance.command';
import { BulkMarkAttendanceCommand } from '../../application/commands/bulk-mark-attendance.command';
import { GetRosterQuery } from '../../application/queries/get-roster.query';
import { GetMyClassesTodayQuery } from '../../application/queries/get-my-classes-today.query';
import { GetAuditLogQuery } from '../../application/queries/get-audit-log.query';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({
    summary: "Get a classroom's roster with a given date's status",
  })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('roster')
  roster(@Query() query: GetRosterDto) {
    return this.queryBus.execute(
      new GetRosterQuery(query.classroom_id, query.date),
    );
  }

  @ApiOperation({
    summary: "Mark (or edit) one student's attendance for a day",
  })
  @Roles(UserRole.TEACHER)
  @Post('mark')
  mark(@Body() dto: MarkAttendanceDto, @CurrentUser() userId: string) {
    return this.commandBus.execute(
      new MarkAttendanceCommand(
        dto.student_id,
        dto.classroom_id,
        dto.date,
        dto.status,
        dto.note ?? null,
        userId,
      ),
    );
  }

  @ApiOperation({
    summary:
      'Bulk-mark a set of students the same status (e.g. "mark all present")',
  })
  @Roles(UserRole.TEACHER)
  @Post('bulk-mark')
  bulkMark(@Body() dto: BulkMarkAttendanceDto, @CurrentUser() userId: string) {
    return this.commandBus.execute(
      new BulkMarkAttendanceCommand(
        dto.student_ids,
        dto.classroom_id,
        dto.date,
        dto.status,
        userId,
      ),
    );
  }

  @ApiOperation({
    summary: "Get the current teacher's classrooms with today's unmarked count",
  })
  @Roles(UserRole.TEACHER)
  @Get('my-classes')
  myClasses(@CurrentUser() userId: string, @Query() query: GetMyClassesDto) {
    return this.queryBus.execute(
      new GetMyClassesTodayQuery(userId, query.date),
    );
  }

  @ApiOperation({
    summary: "Get today's attendance edit history for a classroom",
  })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('audit-log')
  auditLog(@Query() query: GetRosterDto) {
    return this.queryBus.execute(
      new GetAuditLogQuery(query.classroom_id, query.date),
    );
  }
}
