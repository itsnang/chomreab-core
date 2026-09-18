import { DataSource, Repository } from 'typeorm';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import type { UserEntity } from '../../../src/shared/entities/user.entity';

export async function seedClassrooms(
  dataSource: DataSource,
  schoolId: string,
  teacher: UserEntity,
): Promise<ClassroomEntity[]> {
  const repo: Repository<ClassroomEntity> = dataSource.getRepository(ClassroomEntity);
  const existing = await repo.findOneBy({ name: 'Grade 3A', schoolId });
  if (existing) {
    console.log('  [skip] classroom "Grade 3A" already exists');
    return [existing];
  }

  const classroom = repo.create({
    id: crypto.randomUUID(),
    schoolId,
    name: 'Grade 3A',
    gradeLabel: 'Grade 3',
    teacherId: teacher.id,
  });
  await repo.save(classroom);
  console.log(`  [+] classroom "${classroom.name}"`);
  return [classroom];
}
