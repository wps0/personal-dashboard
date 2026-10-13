// Lint rules: Google's TypeScript style as packaged in gts 7.0.0
// (https://github.com/google/gts, src/index.ts, Apache-2.0), plus React's
// hooks rules. The gts ruleset is copied here rather than installed: the gts
// package also ships its interactive `init` command, whose dependencies carry
// an unfixed security advisory. Formatting is Prettier with gts's settings
// (.prettierrc.json), run separately (`npm run format`).
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {ignores: ['dist/', 'node_modules/', 'docs/']},

  // gts
  js.configs.recommended,
  prettierConfig,
  {
    rules: {
      'block-scoped-var': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eol-last': 'error',
      'prefer-arrow-callback': 'error',
      'no-trailing-spaces': 'error',
      quotes: ['warn', 'single', {avoidEscape: true}],
      'no-restricted-properties': [
        'error',
        {object: 'describe', property: 'only'},
        {object: 'it', property: 'only'},
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-warning-comments': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-dupe-class-members': 'off',
      'require-atomic-updates': 'off',
    },
  },

  // This project
  {
    rules: {
      // The style guide allows `== null` / `!= null` to cover both null and
      // undefined (https://google.github.io/styleguide/tsguide.html#equality-checks);
      // gts is stricter than the guide here.
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      // `memo(function Name() {...})` keeps component names in React DevTools.
      'prefer-arrow-callback': ['error', {allowNamedFunctions: true}],
    },
  },
  {
    files: ['src/**'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: {globals: globals.browser},
  },
  {
    files: ['*.js', 'vite.config.ts'],
    languageOptions: {globals: globals.node},
  },
  {
    files: ['public/sw.js'],
    languageOptions: {globals: globals.serviceworker},
  },
]);
