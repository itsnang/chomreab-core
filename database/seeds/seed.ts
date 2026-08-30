import { AppDataSource } from './data-source';
import { seedUsers } from './seeders/users.seeder';
import { seedClassrooms } from './seeders/classrooms.seeder';
import { seedStudents } from './seeders/students.seeder';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.\n');

  console.log('Seeding users...');
  const users = await seedUsers(AppDataSource);
  const teacher = users.find((u) => u.email === 'teacher@attendance.dev')!;

  console.log('\nSeeding classrooms...');
  const [classroom] = await seedClassrooms(AppDataSource, teacher);

  console.log('\nSeeding students...');
  await seedStudents(AppDataSource, classroom);

  console.log('\nDone.');
  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
