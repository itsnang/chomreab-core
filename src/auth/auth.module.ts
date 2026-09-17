import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserEntity } from '../shared/entities/user.entity';
import { RefreshTokenEntity } from './infrastructure/entities/refresh-token.entity';
import { PasswordResetTokenEntity } from './infrastructure/entities/password-reset-token.entity';
import { SchoolEntity } from '../school/infrastructure/entities/school.entity';
import { AuthController } from './api/controllers/auth.controller';
import { LoginAdminHandler } from './application/commands/login-admin.handler';
import { LoginTeacherHandler } from './application/commands/login-teacher.handler';
import { ForgotPasswordHandler } from './application/commands/forgot-password.handler';
import { ResetPasswordHandler } from './application/commands/reset-password.handler';
import { ChangePasswordHandler } from './application/commands/change-password.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { EmailService } from './infrastructure/services/email.service';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      PasswordResetTokenEntity,
      SchoolEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    LoginAdminHandler,
    LoginTeacherHandler,
    ForgotPasswordHandler,
    ResetPasswordHandler,
    ChangePasswordHandler,
    RefreshTokenHandler,
    EmailService,
  ],
})
export class AuthModule {}
