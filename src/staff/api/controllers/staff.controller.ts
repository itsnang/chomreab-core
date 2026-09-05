import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateTeacherDto } from '../dto/create-teacher.dto';
import { CreateTeacherCommand } from '../../application/commands/create-teacher.command';
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

  @ApiOperation({ summary: 'Remove a teacher account' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteTeacherCommand(id));
  }
}
