import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { UpdateClassroomCommand } from './update-classroom.command';

@Injectable()
@CommandHandler(UpdateClassroomCommand)
export class UpdateClassroomHandler implements ICommandHandler<
  UpdateClassroomCommand,
  ClassroomEntity
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: UpdateClassroomCommand): Promise<ClassroomEntity> {
    const classrooms = new ScopedRepository(
      this.classroomRepository,
      command.schoolId,
    );
    const classroom = await classrooms.findOneBy({ id: command.id });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    if (command.name !== undefined) classroom.name = command.name;
    if (command.gradeLabel !== undefined)
      classroom.gradeLabel = command.gradeLabel;
    if (command.teacherId !== undefined)
      classroom.teacherId = command.teacherId;
    return classrooms.save(classroom);
  }
}
