import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
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
import { CreateTeacherDto } from '../dto/create-teacher.dto';
import { UpdateTeacherDto } from '../dto/update-teacher.dto';
import { CreateTeacherCommand } from '../../application/commands/create-teacher.command';
import { UpdateTeacherCommand } from '../../application/commands/update-teacher.command';
import { ResetTeacherPasswordCommand } from '../../application/commands/reset-teacher-password.command';
import { DeleteTeacherCommand } from '../../application/commands/delete-teacher.command';
import { GetTeachersQuery } from '../../application/queries/get-teachers.query';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({
    summary: 'List teacher accounts with their assigned classrooms',
  })
  @Get()
  list() {
    return this.queryBus.execute(new GetTeachersQuery());
  }

  @ApiOperation({
    summary: 'Create a teacher account, returns a one-time temporary password',
  })
  @Post()
  create(@Body() dto: CreateTeacherDto) {
    return this.commandBus.execute(
      new CreateTeacherCommand(dto.name, dto.email),
    );
  }

  @ApiOperation({ summary: "Update a teacher's name or email" })
  @ApiResponse({ status: 404, description: 'Teacher not found' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.commandBus.execute(
      new UpdateTeacherCommand(id, dto.name, dto.email),
    );
  }

  @ApiOperation({
    summary: 'Issue a new temporary password for a teacher',
    description:
      'Returns the plaintext password once. The teacher is forced to replace it at next sign-in and every existing session is revoked.',
  })
  @ApiResponse({ status: 404, description: 'Teacher not found' })
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.commandBus.execute(new ResetTeacherPasswordCommand(id));
  }

  @ApiOperation({ summary: 'Remove a teacher account' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteTeacherCommand(id));
  }
}
