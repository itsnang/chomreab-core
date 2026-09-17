import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  StudentEntity,
  StudentStatus,
} from '../../infrastructure/entities/student.entity';
import { GetStudentsQuery } from './get-students.query';

@Injectable()
@QueryHandler(GetStudentsQuery)
export class GetStudentsHandler implements IQueryHandler<
  GetStudentsQuery,
  StudentEntity[]
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  execute(query: GetStudentsQuery): Promise<StudentEntity[]> {
    const students = new ScopedRepository(
      this.studentRepository,
      query.schoolId,
    );
    const where: Omit<FindOptionsWhere<StudentEntity>, 'schoolId'> = {};
    if (query.classroomId) where.classroomId = query.classroomId;
    if (!query.includeInactive) where.status = StudentStatus.ACTIVE;

    return students.find({ where, order: { name: 'ASC' } });
  }
}
