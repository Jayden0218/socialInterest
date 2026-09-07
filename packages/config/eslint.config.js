// Flat config shared by every workspace package.
//
// The TypeScript parser is not optional: the default parser cannot read type
// annotations, so every rule below silently degrades to a parse error without it.
const tseslint = require('typescript-eslint');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: tseslint.parser,
    },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
