import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { UpdateStudentCommand } from './update-student.command';

@Injectable()
@CommandHandler(UpdateStudentCommand)
export class UpdateStudentHandler implements ICommandHandler<
  UpdateStudentCommand,
  StudentEntity
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: UpdateStudentCommand): Promise<StudentEntity> {
    const student = await this.studentRepository.findOneBy({ id: command.id });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (command.name !== undefined) student.name = command.name;
    if (command.classroomId !== undefined)
      student.classroomId = command.classroomId;
    if (command.status !== undefined) student.status = command.status;
    return this.studentRepository.save(student);
  }
}
