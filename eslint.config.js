export default [
  {
    // src/public/sw.js is a service worker with its own globals. The probability lab used
    // to be ignored alongside it; EPIC-5 ported it into src/models/ and src/valuation/, so
    // all of it is linted now.
    ignores: ['dist/**', 'scaffold/**', '_ext/**', 'src/public/sw.js']
  },
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        DOMParser: 'readonly',
        MutationObserver: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      // empty catch blocks hide real upstream failures — the thing this app must not do
      'no-empty': ['error', { allowEmptyCatch: false }],
      'prefer-const': 'error'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
        vi: 'readonly',
        // tests read fixtures off disk, so they get the Node side too
        URL: 'readonly', process: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly'
      }
    }
  }
];
