import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { GetStudentQuery } from './get-student.query';

@Injectable()
@QueryHandler(GetStudentQuery)
export class GetStudentHandler implements IQueryHandler<
  GetStudentQuery,
  StudentEntity
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(query: GetStudentQuery): Promise<StudentEntity> {
    const student = await this.studentRepository.findOneBy({ id: query.id });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }
}
