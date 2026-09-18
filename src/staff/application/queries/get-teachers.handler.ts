import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { GetTeachersQuery } from './get-teachers.query';

export interface TeacherWithClassrooms {
  id: string;
  name: string;
  email: string;
  classroomNames: string[];
}

@Injectable()
@QueryHandler(GetTeachersQuery)
export class GetTeachersHandler implements IQueryHandler<
  GetTeachersQuery,
  TeacherWithClassrooms[]
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(query: GetTeachersQuery): Promise<TeacherWithClassrooms[]> {
    const users = new ScopedRepository(this.userRepository, query.schoolId);
    const classroomRepo = new ScopedRepository(
      this.classroomRepository,
      query.schoolId,
    );
    const [teachers, classrooms] = await Promise.all([
      users.find({
        where: { role: UserRole.TEACHER },
        order: { name: 'ASC' },
      }),
      classroomRepo.find(),
    ]);

    return teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      classroomNames: classrooms
        .filter((c) => c.teacherId === t.id)
        .map((c) => c.name),
    }));
  }
}
