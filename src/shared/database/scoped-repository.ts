import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOptionsWhere,
  Repository,
  UpdateResult,
} from 'typeorm';

/**
 * Every entity that carries a `schoolId` column must implement this so
 * `ScopedRepository<T>` can be constructed for it. Nothing enforces this at
 * runtime — TypeScript's structural typing is the whole point: an entity that
 * doesn't carry `schoolId` simply can't be passed here, which is the same
 * guarantee this class gives every query built against it.
 */
export interface SchoolScoped {
  schoolId: string;
}

/**
 * Wraps a TypeORM `Repository<T>`, bound to one School for its whole
 * lifetime. Every method's `where` type `Omit`s `schoolId` — there is no
 * parameter position to pass one in, so a handler cannot compile a query that
 * forgets to scope it, and cannot override the scope by passing a different
 * one either. `schoolId` is injected exactly once, at the constructor
 * boundary, from wherever the caller got it (in practice: a Command/Query
 * constructor param sourced from the authenticated request).
 *
 * Deliberately not a `REQUEST`-scoped Nest provider: that would make every
 * CQRS handler that (transitively) depends on one request-scoped too,
 * losing CommandBus/QueryBus's singleton handler caching across the whole
 * app. Instead this is constructed fresh, cheaply, inside a handler's
 * `execute()` — an ordinary object, not a DI-managed one.
 *
 * See the leak test in `scoped-repository.spec.ts` for the guarantee this is
 * meant to uphold, and `link-parent.handler.ts` for the one deliberate
 * exception in the whole codebase (resolving `schoolId` from a globally
 * unique linking code, before any `ScopedRepository` can be constructed).
 */
export class ScopedRepository<T extends SchoolScoped> {
  constructor(
    private readonly repo: Repository<T>,
    private readonly schoolId: string,
  ) {}

  find(
    options: Omit<FindManyOptions<T>, 'where'> & {
      where?:
        | Omit<FindOptionsWhere<T>, 'schoolId'>
        | Omit<FindOptionsWhere<T>, 'schoolId'>[];
    } = {},
  ): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: this.scopeWhere(options.where),
    });
  }

  findOne(
    options: Omit<FindManyOptions<T>, 'where'> & {
      where?:
        | Omit<FindOptionsWhere<T>, 'schoolId'>
        | Omit<FindOptionsWhere<T>, 'schoolId'>[];
    },
  ): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: this.scopeWhere(options.where),
    });
  }

  findOneBy(where: Omit<FindOptionsWhere<T>, 'schoolId'>): Promise<T | null> {
    return this.repo.findOneBy({
      ...where,
      schoolId: this.schoolId,
    });
  }

  count(
    options: Omit<FindManyOptions<T>, 'where'> & {
      where?:
        | Omit<FindOptionsWhere<T>, 'schoolId'>
        | Omit<FindOptionsWhere<T>, 'schoolId'>[];
    } = {},
  ): Promise<number> {
    return this.repo.count({
      ...options,
      where: this.scopeWhere(options.where),
    });
  }

  create(entity: DeepPartial<Omit<T, 'schoolId'>>): T {
    return this.repo.create({
      ...entity,
      schoolId: this.schoolId,
    } as DeepPartial<T>);
  }

  /** Force-sets `schoolId` on every row saved, so a handler cannot write into
   *  another School even by building the entity object from input that
   *  happens to carry a different id — the value passed in is discarded, not
   *  merely defaulted. */
  save<E extends DeepPartial<T>>(entity: E): Promise<E & T> {
    return this.repo.save({
      ...entity,
      schoolId: this.schoolId,
    } as T) as Promise<E & T>;
  }

  delete(where: Omit<FindOptionsWhere<T>, 'schoolId'>): Promise<DeleteResult> {
    return this.repo.delete({
      ...where,
      schoolId: this.schoolId,
    });
  }

  update(
    where: Omit<FindOptionsWhere<T>, 'schoolId'>,
    partial: DeepPartial<Omit<T, 'schoolId'>>,
  ): Promise<UpdateResult> {
    return this.repo.update(
      { ...where, schoolId: this.schoolId },
      partial as never,
    );
  }

  private scopeWhere(
    where:
      | Omit<FindOptionsWhere<T>, 'schoolId'>
      | Omit<FindOptionsWhere<T>, 'schoolId'>[]
      | undefined,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (Array.isArray(where)) {
      return where.map((clause) => ({ ...clause, schoolId: this.schoolId }));
    }
    return { ...(where ?? {}), schoolId: this.schoolId } as FindOptionsWhere<T>;
  }
}
