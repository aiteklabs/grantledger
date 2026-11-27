import cloudflare from '@cloudflare/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [cloudflare],
  env: cloudflare.env,
  ignorePatterns: [...cloudflare.ignorePatterns, '**/.astro/**'],
  // The preset was adopted on 2026-11-27 on code written without it. Every rule below reported existing code that
  // day and is off until that code is brought in line, one rule at a time.
  rules: {
    'curly': 'off',
    'import/consistent-type-specifier-style': 'off',
    'import/no-namespace': 'off',
    '@nkzw/no-instanceof': 'off',
    'no-console': 'off',
    'no-control-regex': 'off',
    'no-empty': 'off',
    'no-promise-executor-return': 'off',
    'no-var': 'off',
    'prefer-arrow-callback': 'off',
    'quality/no-array-filter-map': 'off',
    'quality/no-conditional-empty-object-spread': 'off',
    'quality/no-known-value-widening': 'off',
    'quality/no-unknown-returns': 'off',
    'quality/no-unsafe-dictionary-type': 'off',
    'typescript/array-type': 'off',
    'typescript/no-misused-spread': 'off',
    'typescript/no-non-null-assertion': 'off',
    'typescript/no-unnecessary-type-assertion': 'off',
    'typescript/no-unsafe-argument': 'off',
    'typescript/no-unsafe-assignment': 'off',
    'typescript/no-unsafe-call': 'off',
    'typescript/no-unsafe-member-access': 'off',
    'typescript/no-unsafe-type-assertion': 'off',
    'unicorn/catch-error-name': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/no-hex-escape': 'off',
    'unicorn/numeric-separators-style': 'off',
    'unicorn/prefer-at': 'off',
    'unicorn/prefer-number-properties': 'off',
    'unicorn/prefer-optional-catch-binding': 'off',
    'unicorn/prefer-set-has': 'off',
    'unicorn/prefer-single-call': 'off',
    'unicorn/prefer-string-raw': 'off',
    'unicorn/prefer-string-replace-all': 'off',
  },
  overrides: [
    {
      // Astro components use the `Astro` global and frontmatter names the linter does not see; `astro check`
      // reports undefined names there.
      files: ['**/*.astro'],
      rules: { 'no-undef': 'off' },
    },
  ],
});
