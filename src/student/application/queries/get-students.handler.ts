import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
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
    return this.studentRepository.find({
      where: query.classroomId ? { classroomId: query.classroomId } : {},
      order: { name: 'ASC' },
    });
  }
}
