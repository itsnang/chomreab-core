import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from './infrastructure/entities/classroom.entity';
import { ClassroomsController } from './api/controllers/classrooms.controller';
import { CreateClassroomHandler } from './application/commands/create-classroom.handler';
import { UpdateClassroomHandler } from './application/commands/update-classroom.handler';
import { DeleteClassroomHandler } from './application/commands/delete-classroom.handler';
import { GetClassroomsHandler } from './application/queries/get-classrooms.handler';
import { GetClassroomHandler } from './application/queries/get-classroom.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([ClassroomEntity]),
    JwtModule.register({}),
  ],
  controllers: [ClassroomsController],
  providers: [
    CreateClassroomHandler,
    UpdateClassroomHandler,
    DeleteClassroomHandler,
    GetClassroomsHandler,
    GetClassroomHandler,
  ],
})
export class ClassroomModule {}
