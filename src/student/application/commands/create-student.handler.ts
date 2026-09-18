import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  StudentEntity,
  StudentStatus,
} from '../../infrastructure/entities/student.entity';
import { CreateStudentCommand } from './create-student.command';

@Injectable()
@CommandHandler(CreateStudentCommand)
export class CreateStudentHandler implements ICommandHandler<
  CreateStudentCommand,
  StudentEntity
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: CreateStudentCommand): Promise<StudentEntity> {
    const students = new ScopedRepository(
      this.studentRepository,
      command.schoolId,
    );
    const student = students.create({
      id: crypto.randomUUID(),
      name: command.name,
      classroomId: command.classroomId,
      status: StudentStatus.ACTIVE,
    });
    return students.save(student);
  }
}
