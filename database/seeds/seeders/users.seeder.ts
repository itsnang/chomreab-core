import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';

/** The demo defaults are fine on a laptop, but this seeder also runs against
 *  deployed databases (`npm run seed:prod`), where a known email and password
 *  on a public domain is an open door. Every value is overridable from the
 *  environment so a real deployment never has to ship the demo credentials. */
const DEMO_PASSWORD = 'password123';

const USERS = [
  {
    name: 'Admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@attendance.dev',
    password: process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD,
    role: UserRole.ADMIN,
  },
  {
    name: 'Teacher Demo',
    email: process.env.SEED_TEACHER_EMAIL ?? 'teacher@attendance.dev',
    password: process.env.SEED_TEACHER_PASSWORD ?? DEMO_PASSWORD,
    role: UserRole.TEACHER,
  },
];

export async function seedUsers(dataSource: DataSource): Promise<UserEntity[]> {
  const repo: Repository<UserEntity> = dataSource.getRepository(UserEntity);
  const results: UserEntity[] = [];

  if (USERS.some((u) => u.password === DEMO_PASSWORD)) {
    console.warn(
      '  [!] seeding with the demo password. Set SEED_ADMIN_PASSWORD and\n' +
        '      SEED_TEACHER_PASSWORD before seeding anything reachable from the internet.',
    );
  }

  for (const data of USERS) {
    const existing = await repo.findOneBy({ email: data.email });
    if (existing) {
      console.log(`  [skip] user "${data.email}" already exists`);
      results.push(existing);
      continue;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = repo.create({
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
    });
    await repo.save(user);
    console.log(`  [+] user "${data.email}" (${data.role})`);
    results.push(user);
  }

  return results;
}
