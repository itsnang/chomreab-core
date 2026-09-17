import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateClassroomDto } from '../dto/create-classroom.dto';
import { UpdateClassroomDto } from '../dto/update-classroom.dto';
import { CreateClassroomCommand } from '../../application/commands/create-classroom.command';
import { UpdateClassroomCommand } from '../../application/commands/update-classroom.command';
import { DeleteClassroomCommand } from '../../application/commands/delete-classroom.command';
import { GetClassroomsQuery } from '../../application/queries/get-classrooms.query';
import { GetClassroomQuery } from '../../application/queries/get-classroom.query';

@ApiTags('classrooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List all classrooms' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get()
  list(@CurrentSchoolId() schoolId: string) {
    return this.queryBus.execute(new GetClassroomsQuery(schoolId));
  }

  @ApiOperation({ summary: 'Get one classroom' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id')
  get(@CurrentSchoolId() schoolId: string, @Param('id') id: string) {
    return this.queryBus.execute(new GetClassroomQuery(schoolId, id));
  }

  @ApiOperation({ summary: 'Create a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentSchoolId() schoolId: string, @Body() dto: CreateClassroomDto) {
    return this.commandBus.execute(
      new CreateClassroomCommand(
        schoolId,
        dto.name,
        dto.grade_label ?? null,
        dto.teacher_id ?? null,
      ),
    );
  }

  @ApiOperation({ summary: 'Update a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentSchoolId() schoolId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClassroomDto,
  ) {
    return this.commandBus.execute(
      new UpdateClassroomCommand(
        schoolId,
        id,
        dto.name,
        dto.grade_label,
        dto.teacher_id,
      ),
    );
  }

  @ApiOperation({ summary: 'Delete a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@CurrentSchoolId() schoolId: string, @Param('id') id: string) {
    return this.commandBus.execute(new DeleteClassroomCommand(schoolId, id));
  }
}
