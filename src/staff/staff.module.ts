import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../shared/entities/user.entity';
import { ClassroomEntity } from '../classroom/infrastructure/entities/classroom.entity';
import { StaffController } from './api/controllers/staff.controller';
import { CreateTeacherHandler } from './application/commands/create-teacher.handler';
import { DeleteTeacherHandler } from './application/commands/delete-teacher.handler';
import { GetTeachersHandler } from './application/queries/get-teachers.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([UserEntity, ClassroomEntity]),
    JwtModule.register({}),
  ],
  controllers: [StaffController],
  providers: [CreateTeacherHandler, DeleteTeacherHandler, GetTeachersHandler],
})
export class StaffModule {}
