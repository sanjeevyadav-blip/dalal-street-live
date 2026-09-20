export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { window: 'readonly', document: 'readonly', fetch: 'readonly', console: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      // empty catch blocks hide real upstream failures — the thing this app must not do
      'no-empty': ['error', { allowEmptyCatch: false }],
      'prefer-const': 'error'
    }
  }
];
