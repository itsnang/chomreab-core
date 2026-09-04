import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async execute(): Promise<TeacherWithClassrooms[]> {
    const [teachers, classrooms] = await Promise.all([
      this.userRepository.find({
        where: { role: UserRole.TEACHER },
        order: { name: 'ASC' },
      }),
      this.classroomRepository.find(),
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
