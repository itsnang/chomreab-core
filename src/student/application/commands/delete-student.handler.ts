import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { DeleteStudentCommand } from './delete-student.command';

@Injectable()
@CommandHandler(DeleteStudentCommand)
export class DeleteStudentHandler implements ICommandHandler<
  DeleteStudentCommand,
  void
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: DeleteStudentCommand): Promise<void> {
    const students = new ScopedRepository(
      this.studentRepository,
      command.schoolId,
    );
    const result = await students.delete({ id: command.id });
    if (!result.affected) {
      throw new NotFoundException('Student not found');
    }
  }
}
