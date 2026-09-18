import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { CreateClassroomCommand } from './create-classroom.command';

@Injectable()
@CommandHandler(CreateClassroomCommand)
export class CreateClassroomHandler implements ICommandHandler<
  CreateClassroomCommand,
  ClassroomEntity
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: CreateClassroomCommand): Promise<ClassroomEntity> {
    const classrooms = new ScopedRepository(
      this.classroomRepository,
      command.schoolId,
    );
    const classroom = classrooms.create({
      id: crypto.randomUUID(),
      name: command.name,
      gradeLabel: command.gradeLabel,
      teacherId: command.teacherId,
    });
    return classrooms.save(classroom);
  }
}
