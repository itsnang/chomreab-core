import { DataSource, Repository } from 'typeorm';
import { SchoolEntity } from '../../../src/school/infrastructure/entities/school.entity';

const SCHOOL_NAME = process.env.SEED_SCHOOL_NAME ?? 'My School';

/** The seeded School's trial has already been "verified" — there is no email
 *  to click through here, since this is a demo/dev seed, not a real signup.
 *  Without this, none of the seeded accounts could sign in at all: login now
 *  gates on the School's own emailVerifiedAt (CONTEXT.md's "Trial" entry). */
export async function seedSchool(dataSource: DataSource): Promise<SchoolEntity> {
  const repo: Repository<SchoolEntity> = dataSource.getRepository(SchoolEntity);
  const existing = await repo.findOneBy({ name: SCHOOL_NAME });
  if (existing) {
    console.log(`  [skip] school "${SCHOOL_NAME}" already exists`);
    return existing;
  }

  const school = repo.create({
    id: crypto.randomUUID(),
    name: SCHOOL_NAME,
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    emailVerifiedAt: new Date(),
  });
  await repo.save(school);
  console.log(`  [+] school "${school.name}"`);
  return school;
}
