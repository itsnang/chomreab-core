// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import requireScopedRepository from './eslint-rules/require-scoped-repository.mjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Scoped to src/ only: the seeders (database/seeds/) run outside any
    // School's request context entirely, by construction, and were never
    // meant to go through ScopedRepository. scoped-repository.ts is the
    // wrapper itself — it calls the raw Repository by design.
    files: ['src/**/*.ts'],
    ignores: ['src/shared/database/scoped-repository.ts'],
    plugins: { local: { rules: { 'require-scoped-repository': requireScopedRepository } } },
    rules: {
      'local/require-scoped-repository': 'error',
    },
  },
);
