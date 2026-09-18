import { UserRole } from '../../src/shared/entities/user.entity';
import { AppDataSource } from './data-source';
import { seedSchool } from './seeders/school.seeder';
import { seedUsers } from './seeders/users.seeder';
import { seedClassrooms } from './seeders/classrooms.seeder';
import { seedStudents } from './seeders/students.seeder';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.\n');

  console.log('Seeding school...');
  const school = await seedSchool(AppDataSource);

  console.log('\nSeeding users...');
  const users = await seedUsers(AppDataSource, school.id);
  // By role, not by address: the seeded emails are overridable from the
  // environment, so matching a literal address silently yields undefined and
  // the crash surfaces later, inside the classroom seeder.
  const teacher = users.find((u) => u.role === UserRole.TEACHER);
  if (!teacher) {
    throw new Error('No teacher was seeded; cannot attach a classroom to one.');
  }

  console.log('\nSeeding classrooms...');
  const [classroom] = await seedClassrooms(AppDataSource, school.id, teacher);

  console.log('\nSeeding students...');
  await seedStudents(AppDataSource, school.id, classroom);

  console.log('\nDone.');
  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
