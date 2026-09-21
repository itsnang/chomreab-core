// @ts-check
import { ESLintUtils } from '@typescript-eslint/utils';

// Every read/write shape a TypeORM Repository exposes that could touch rows
// directly — not just the ones this codebase happens to call today. A gap
// here is a silent hole in the rule, not a compile error, so it's kept wider
// than current usage on purpose.
const RESTRICTED_METHODS = new Set([
  'find',
  'findOne',
  'findOneBy',
  'findBy',
  'findAndCount',
  'findAndCountBy',
  'save',
  'update',
  'upsert',
  'delete',
  'softDelete',
  'remove',
  'softRemove',
  'restore',
  'insert',
  'count',
  'countBy',
  'exists',
  'existsBy',
  'increment',
  'decrement',
]);

/**
 * Flags a direct method call on an injected `Repository<T>` where `T` has a
 * `schoolId` column — the exact shape `ScopedRepository` exists to force
 * through its type-safe wrapper instead. See docs/adr/0010 for why this
 * rule exists and the full, reasoned list of every call site it doesn't
 * apply to (each carries its own eslint-disable comment citing that ADR).
 *
 * This is a backstop, not a guarantee on its own: `ScopedRepository`'s own
 * type signatures are the real guarantee (no `schoolId` slot to omit in the
 * first place). This rule just catches the case where a handler never
 * constructs one at all.
 *
 * `createQueryBuilder()` is checked separately from RESTRICTED_METHODS: it
 * returns a `SelectQueryBuilder<T>`, not a `Repository<T>`, so the
 * Repository-symbol check below would never see it — and everything chained
 * off the builder (`.where()`, `.getMany()`, ...) can't be type-narrowed
 * back to "this reads a tenant table" the same way a Repository method can.
 * The construction call itself is what's flagged, since that's the one
 * point still provably typed as `Repository<T>`.
 */
export default ESLintUtils.RuleCreator(
  () => 'https://github.com/itsnang/attendance-api/blob/develop/docs/adr/0010-unscoped-tenant-queries.md',
)({
  name: 'require-scoped-repository',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Tenant-scoped repositories must be wrapped in ScopedRepository before use, not called directly.',
    },
    schema: [],
    messages: {
      unscoped:
        'Direct .{{method}}() on Repository<{{entity}}>, which carries schoolId. Wrap it in ScopedRepository, or if this is a deliberate exception, add an eslint-disable comment citing docs/adr/0010.',
      unscopedQueryBuilder:
        'createQueryBuilder() on Repository<{{entity}}>, which carries schoolId, builds an unscoped query — nothing chained off it can be type-checked back to a School boundary. Filter by schoolId explicitly, or if deliberate, add an eslint-disable comment citing docs/adr/0010.',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    /** @param {import('typescript').Type} type */
    function tenantEntityOf(type) {
      const symbol = type.getSymbol();
      if (!symbol || symbol.getName() !== 'Repository') return null;

      // Confirm it's typeorm's Repository, not an unrelated same-named type.
      const declarations = symbol.getDeclarations() ?? [];
      const fromTypeorm = declarations.some((d) =>
        d.getSourceFile().fileName.includes('/typeorm/'),
      );
      if (!fromTypeorm) return null;

      // Not every `Repository`-symbol type is a type *reference* with
      // resolvable arguments (a generic constraint, a mapped type, ...) —
      // `getTypeArguments` throws on those instead of returning `[]`, which
      // would otherwise crash the whole `eslint` run over one unusual call
      // site rather than just skipping it.
      let typeArgs;
      try {
        typeArgs = checker.getTypeArguments(
          /** @type {import('typescript').TypeReference} */ (type),
        );
      } catch {
        return null;
      }
      const entityType = typeArgs[0];
      if (!entityType) return null;

      const hasSchoolId = checker
        .getPropertiesOfType(entityType)
        .some((p) => p.getName() === 'schoolId');
      return hasSchoolId ? entityType : null;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const property = node.callee.property;
        if (property.type !== 'Identifier') return;

        const isQueryBuilder = property.name === 'createQueryBuilder';
        if (!isQueryBuilder && !RESTRICTED_METHODS.has(property.name)) return;

        const objectType = services.getTypeAtLocation(node.callee.object);
        const entityType = tenantEntityOf(objectType);
        if (!entityType) return;

        context.report({
          node,
          messageId: isQueryBuilder ? 'unscopedQueryBuilder' : 'unscoped',
          data: {
            method: property.name,
            entity: checker.typeToString(entityType),
          },
        });
      },
    };
  },
});
