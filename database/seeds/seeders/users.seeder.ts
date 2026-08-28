import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';

const USERS = [
  { name: 'Admin', email: 'admin@attendance.dev', password: 'password123', role: UserRole.ADMIN },
  { name: 'Teacher Demo', email: 'teacher@attendance.dev', password: 'password123', role: UserRole.TEACHER },
];

export async function seedUsers(dataSource: DataSource): Promise<UserEntity[]> {
  const repo: Repository<UserEntity> = dataSource.getRepository(UserEntity);
  const results: UserEntity[] = [];

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
