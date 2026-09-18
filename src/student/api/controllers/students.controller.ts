import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateStudentDto } from '../dto/create-student.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { CreateStudentCommand } from '../../application/commands/create-student.command';
import { UpdateStudentCommand } from '../../application/commands/update-student.command';
import { DeleteStudentCommand } from '../../application/commands/delete-student.command';
import { GetStudentsQuery } from '../../application/queries/get-students.query';
import { GetStudentQuery } from '../../application/queries/get-student.query';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List students, optionally filtered by classroom' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get()
  list(
    @CurrentSchoolId() schoolId: string,
    @Query('classroom_id') classroomId?: string,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.queryBus.execute(
      new GetStudentsQuery(schoolId, classroomId, includeInactive === 'true'),
    );
  }

  @ApiOperation({ summary: 'Get one student' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id')
  get(@CurrentSchoolId() schoolId: string, @Param('id') id: string) {
    return this.queryBus.execute(new GetStudentQuery(schoolId, id));
  }

  @ApiOperation({ summary: 'Add a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentSchoolId() schoolId: string, @Body() dto: CreateStudentDto) {
    return this.commandBus.execute(
      new CreateStudentCommand(schoolId, dto.name, dto.classroom_id),
    );
  }

  @ApiOperation({ summary: 'Edit a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentSchoolId() schoolId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.commandBus.execute(
      new UpdateStudentCommand(
        schoolId,
        id,
        dto.name,
        dto.classroom_id,
        dto.status,
      ),
    );
  }

  @ApiOperation({ summary: 'Remove a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@CurrentSchoolId() schoolId: string, @Param('id') id: string) {
    return this.commandBus.execute(new DeleteStudentCommand(schoolId, id));
  }
}
