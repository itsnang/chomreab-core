import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from './infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from './infrastructure/entities/parent-link.entity';
import { ParentLinksController } from './api/controllers/parent-links.controller';
import { GenerateLinkingCodeHandler } from './application/commands/generate-linking-code.handler';
import { GetLinkingStatusHandler } from './application/queries/get-linking-status.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StudentEntity,
      LinkingCodeEntity,
      ParentLinkEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [ParentLinksController],
  providers: [GenerateLinkingCodeHandler, GetLinkingStatusHandler],
})
export class ParentLinkModule {}
