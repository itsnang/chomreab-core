import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SignupSchoolDto } from '../dto/signup-school.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { SignupSchoolCommand } from '../../application/commands/signup-school.command';
import { VerifyEmailCommand } from '../../application/commands/verify-email.command';

/** Unauthenticated on purpose — this is how a School comes to exist at all,
 *  before there is any account to authenticate with. */
@ApiTags('schools')
@Controller('schools')
export class SchoolController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({
    summary: 'Create a School and its founding admin account',
    description:
      'Starts a 30-day trial immediately. The account cannot sign in until the verification email is confirmed.',
  })
  @ApiResponse({
    status: 201,
    description: 'School created, verification email sent',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @HttpCode(201)
  @Post('signup')
  signup(@Body() dto: SignupSchoolDto) {
    return this.commandBus.execute(
      new SignupSchoolCommand(
        dto.school_name,
        dto.admin_name,
        dto.admin_email,
        dto.password,
      ),
    );
  }

  @ApiOperation({ summary: "Confirm a School's founding admin email" })
  @ApiResponse({
    status: 200,
    description: 'Verified — the account can now sign in',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification link',
  })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.commandBus.execute(new VerifyEmailCommand(dto.token));
  }
}
