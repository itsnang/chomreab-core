import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { GetClassroomsQuery } from './get-classrooms.query';

@Injectable()
@QueryHandler(GetClassroomsQuery)
export class GetClassroomsHandler implements IQueryHandler<
  GetClassroomsQuery,
  ClassroomEntity[]
> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  execute(query: GetClassroomsQuery): Promise<ClassroomEntity[]> {
    const classrooms = new ScopedRepository(
      this.classroomRepository,
      query.schoolId,
    );
    return classrooms.find({ order: { name: 'ASC' } });
  }
}
