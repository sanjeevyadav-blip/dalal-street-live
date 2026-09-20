export default [
  {
    // src/sw.js is a service worker (its own globals) and
    // src/probability-lab.NOT-DEPLOYED.js is an unshipped classic script — both are
    // linted once EPIC-5 ports them into src/models/. See engineering/18 E5-1..E5-5.
    ignores: ['dist/**', 'scaffold/**', '_ext/**', 'src/sw.js', 'src/probability-lab.NOT-DEPLOYED.js']
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
