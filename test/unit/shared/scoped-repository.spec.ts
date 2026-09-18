import { ScopedRepository } from '../../../src/shared/database/scoped-repository';

/**
 * The backstop for the whole multi-tenancy design: prove `ScopedRepository`
 * cannot be made to cross a School boundary, even when the caller supplies
 * IDs that collide or an empty filter. This is the guarantee every handler
 * in the app leans on instead of re-deriving it per query — see ADR-0006.
 *
 * (The compile-time half of the guarantee — that a `where` clause has no
 * slot for `schoolId` at all — isn't re-tested here with a synthetic
 * interface: TypeORM's `FindOptionsWhere<T>` only gets its real, narrow
 * shape from an `@Entity()`-decorated class, and every production handler
 * that uses `ScopedRepository` against a real entity already exercises that;
 * a hand-rolled interface here would test TypeScript's type system against a
 * type TypeORM was never designed to narrow, not the actual guarantee.)
 *
 * Verified live against a real Postgres and a real running app in this same
 * session (two seeded Schools, two JWTs, `GET /students`, `GET /students/:id`
 * for another School's row, `GET /reports/summary`) — this spec is the
 * permanent, fast version of that same proof, run against an in-memory fake
 * repository rather than a database.
 */
describe('ScopedRepository', () => {
  interface Row {
    id: string;
    schoolId: string;
    name: string;
  }

  // A minimal fake standing in for TypeORM's Repository<T>, just enough to
  // exercise ScopedRepository's own merging logic — the thing under test is
  // whether ScopedRepository forces schoolId into every call, not whether
  // TypeORM itself can filter correctly.
  class FakeRepo {
    constructor(public rows: Row[]) {}

    find({ where }: { where?: Partial<Row> } = {}) {
      return Promise.resolve(this.matching(where));
    }

    findOneBy(where: Partial<Row>) {
      return Promise.resolve(this.matching(where)[0] ?? null);
    }

    create(entity: Partial<Row>): Row {
      return entity as Row;
    }

    save(entity: Row) {
      this.rows.push(entity);
      return Promise.resolve(entity);
    }

    private matching(where: Partial<Row> | undefined): Row[] {
      if (!where) return this.rows;
      return this.rows.filter((row) =>
        (Object.keys(where) as (keyof Row)[]).every(
          (key) => row[key] === where[key],
        ),
      );
    }
  }

  function scoped(rows: Row[], schoolId: string): ScopedRepository<Row> {
    return new ScopedRepository<Row>(new FakeRepo(rows) as never, schoolId);
  }

  // Two Schools, with a row that deliberately collides on every field except
  // schoolId — the id is the same on both sides, and the name is the same on
  // both sides. If scoping only worked "most of the time", this is the case
  // that would still leak.
  const sharedId = 'row-1';
  const rows: Row[] = [
    { id: sharedId, schoolId: 'school-a', name: 'Same Name' },
    { id: sharedId, schoolId: 'school-b', name: 'Same Name' },
    { id: 'row-2', schoolId: 'school-a', name: 'Only In A' },
  ];

  it("never returns another School's row on an empty filter", async () => {
    const result = await scoped(rows, 'school-a').find();
    expect(result.every((r) => r.schoolId === 'school-a')).toBe(true);
    expect(result.map((r) => r.name).sort()).toEqual([
      'Only In A',
      'Same Name',
    ]);
  });

  it("never returns another School's row even when the id matches exactly", async () => {
    const fromA = await scoped(rows, 'school-a').findOneBy({ id: sharedId });
    const fromB = await scoped(rows, 'school-b').findOneBy({ id: sharedId });

    expect(fromA?.schoolId).toBe('school-a');
    expect(fromB?.schoolId).toBe('school-b');
    // Same id, different rows — schoolId is what disambiguated them.
    expect(fromA).not.toBe(fromB);
  });

  it('finds nothing when the matching row belongs to a different School', async () => {
    const result = await scoped(rows, 'school-b').findOneBy({ id: 'row-2' }); // only exists under school-a
    expect(result).toBeNull();
  });

  it('force-sets schoolId on save, discarding whatever the caller passed', async () => {
    const fake = new FakeRepo([]);
    const repo = new ScopedRepository<Row>(fake as never, 'school-a');

    // Even if a handler built this entity from input that happened to carry
    // a different schoolId, the save is pinned to the repository's own scope.
    await repo.save({ id: 'new-row', schoolId: 'school-b', name: 'Spoofed' });

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].schoolId).toBe('school-a');
  });
});
