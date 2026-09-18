import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { DeleteClassroomCommand } from './delete-classroom.command';

@Injectable()
@CommandHandler(DeleteClassroomCommand)
export class DeleteClassroomHandler implements ICommandHandler<
  DeleteClassroomCommand,
  void
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: DeleteClassroomCommand): Promise<void> {
    const classrooms = new ScopedRepository(
      this.classroomRepository,
      command.schoolId,
    );
    const result = await classrooms.delete({ id: command.id });
    if (!result.affected) {
      throw new NotFoundException('Classroom not found');
    }
  }
}
