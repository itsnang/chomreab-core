import { DataSource, Repository } from 'typeorm';
import { StudentEntity, StudentStatus } from '../../../src/student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

const NAMES = ['Sokha', 'Dara'];

export async function seedStudents(
  dataSource: DataSource,
  schoolId: string,
  classroom: ClassroomEntity,
): Promise<StudentEntity[]> {
  const repo: Repository<StudentEntity> = dataSource.getRepository(StudentEntity);
  const results: StudentEntity[] = [];

  for (const name of NAMES) {
    const existing = await repo.findOneBy({
      name,
      classroomId: classroom.id,
      schoolId,
    });
    if (existing) {
      console.log(`  [skip] student "${name}" already exists`);
      results.push(existing);
      continue;
    }
    const student = repo.create({
      id: crypto.randomUUID(),
      schoolId,
      name,
      classroomId: classroom.id,
      status: StudentStatus.ACTIVE,
    });
    await repo.save(student);
    console.log(`  [+] student "${name}"`);
    results.push(student);
  }

  return results;
}
