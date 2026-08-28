import { AppDataSource } from './data-source';
import { seedUsers } from './seeders/users.seeder';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.\n');

  console.log('Seeding users...');
  await seedUsers(AppDataSource);

  console.log('\nDone.');
  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
