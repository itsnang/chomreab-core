import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { GetClassroomQuery } from './get-classroom.query';

@Injectable()
@QueryHandler(GetClassroomQuery)
export class GetClassroomHandler implements IQueryHandler<
  GetClassroomQuery,
  ClassroomEntity
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(query: GetClassroomQuery): Promise<ClassroomEntity> {
    const classrooms = new ScopedRepository(
      this.classroomRepository,
      query.schoolId,
    );
    const classroom = await classrooms.findOneBy({ id: query.id });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }
}
