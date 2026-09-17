import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentSchoolId } from '../../../shared/decorators/current-school-id.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { GenerateLinkingCodeDto } from '../dto/generate-linking-code.dto';
import { GenerateLinkingCodeCommand } from '../../application/commands/generate-linking-code.command';
import { GetLinkingStatusQuery } from '../../application/queries/get-linking-status.query';

@ApiTags('parent-links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('parent-links')
export class ParentLinksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({
    summary: 'List every student with linked/unlinked status (follow-up list)',
  })
  @Get('status')
  status(@CurrentSchoolId() schoolId: string) {
    return this.queryBus.execute(new GetLinkingStatusQuery(schoolId));
  }

  @ApiOperation({
    summary:
      'Generate a new linking code for a student, printable/shareable to a parent',
  })
  @Post('codes')
  generateCode(
    @CurrentSchoolId() schoolId: string,
    @Body() dto: GenerateLinkingCodeDto,
  ) {
    return this.commandBus.execute(
      new GenerateLinkingCodeCommand(schoolId, dto.student_id),
    );
  }
}
