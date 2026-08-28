import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from './infrastructure/entities/student.entity';
import { StudentsController } from './api/controllers/students.controller';
import { CreateStudentHandler } from './application/commands/create-student.handler';
import { UpdateStudentHandler } from './application/commands/update-student.handler';
import { DeleteStudentHandler } from './application/commands/delete-student.handler';
import { GetStudentsHandler } from './application/queries/get-students.handler';
import { GetStudentHandler } from './application/queries/get-student.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([StudentEntity]),
    JwtModule.register({}),
  ],
  controllers: [StudentsController],
  providers: [
    CreateStudentHandler,
    UpdateStudentHandler,
    DeleteStudentHandler,
    GetStudentsHandler,
    GetStudentHandler,
  ],
})
export class StudentModule {}
