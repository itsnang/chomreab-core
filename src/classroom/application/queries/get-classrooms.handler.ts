import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  execute(_query: GetClassroomsQuery): Promise<ClassroomEntity[]> {
    return this.classroomRepository.find({ order: { name: 'ASC' } });
  }
}
