import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolEntity } from './infrastructure/entities/school.entity';
import { EmailVerificationTokenEntity } from './infrastructure/entities/email-verification-token.entity';
import { UserEntity } from '../shared/entities/user.entity';
import { SchoolController } from './api/controllers/school.controller';
import { SignupSchoolHandler } from './application/commands/signup-school.handler';
import { VerifyEmailHandler } from './application/commands/verify-email.handler';
import { EmailService } from '../auth/infrastructure/services/email.service';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      SchoolEntity,
      EmailVerificationTokenEntity,
      UserEntity,
    ]),
  ],
  controllers: [SchoolController],
  providers: [SignupSchoolHandler, VerifyEmailHandler, EmailService],
  // Other modules read a School's own row (e.g. the login handlers' email-
  // verification gate) — exporting the repository via TypeOrmModule, not a
  // hand-written service, matches how every other module in this codebase
  // shares an entity (@InjectRepository directly, no wrapper).
  exports: [TypeOrmModule],
})
export class SchoolModule {}
