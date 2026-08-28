import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { LoginAdminCommand } from '../../application/commands/login-admin.command';
import { LoginTeacherCommand } from '../../application/commands/login-teacher.command';
import { ForgotPasswordCommand } from '../../application/commands/forgot-password.command';
import { ResetPasswordCommand } from '../../application/commands/reset-password.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({ summary: 'Login as an admin (rejects non-admin accounts)' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT tokens and user profile',
    schema: {
      example: {
        access_token: '<jwt>',
        refresh_token: '<jwt>',
        user: { id: 'uuid', name: 'Jane Doe', email: 'jane@example.com' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or not an admin account',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @HttpCode(200)
  @Post('admin/login')
  adminLogin(@Body() dto: LoginDto) {
    return this.commandBus.execute(
      new LoginAdminCommand(dto.email, dto.password),
    );
  }

  @ApiOperation({
    summary: 'Login as a teacher (rejects non-teacher accounts)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT tokens and user profile',
    schema: {
      example: {
        access_token: '<jwt>',
        refresh_token: '<jwt>',
        user: { id: 'uuid', name: 'Jane Doe', email: 'jane@example.com' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or not a teacher account',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @HttpCode(200)
  @Post('teacher/login')
  teacherLogin(@Body() dto: LoginDto) {
    return this.commandBus.execute(
      new LoginTeacherCommand(dto.email, dto.password),
    );
  }

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent if account exists',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.commandBus.execute(new ForgotPasswordCommand(dto.email));
  }

  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Returns a new token pair',
    schema: {
      example: {
        access_token: '<jwt>',
        refresh_token: '<jwt>',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.commandBus.execute(new RefreshTokenCommand(dto.refresh_token));
  }

  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token, or validation error',
  })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.commandBus.execute(
      new ResetPasswordCommand(dto.token, dto.new_password),
    );
  }
}
