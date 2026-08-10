/** @type {import('jest').Config} */
export default {
  // One suite spanning src/ plus each per-audience tree the sources moved into.
  roots: [
    '<rootDir>/src',
    '<rootDir>/js/src',
    '<rootDir>/react/src',
    '<rootDir>/webrtc/src',
    '<rootDir>/server/src',
    // The build guards live here. They protect published promises, so their own
    // detection is unit-tested rather than proven by a red CI run.
    '<rootDir>/scripts',
  ],
  testMatch: ['**/__tests__/**/*.+(ts|tsx)', '**/*.test.+(ts|tsx)'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Node',
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.css$': '<rootDir>/js/src/__mocks__/styleMock.js',
    // Each package resolved to its SOURCE, so the suite runs against the working
    // tree and needs no build first. Note this is the opposite of tsconfig, which
    // points these at the siblings' dist/: there, mapping to source would pull a
    // sibling into the package's own program and break its rootDir.
    '^@dialstack/sdk-js$': '<rootDir>/js/src/index.ts',
    '^@dialstack/sdk-js/pure$': '<rootDir>/js/src/pure.ts',
    '^@dialstack/sdk-webrtc$': '<rootDir>/webrtc/src/index.ts',
    '^@dialstack/sdk-server$': '<rootDir>/server/src/index.ts',
    // Longest-first: a plain '^@dialstack/sdk-react$' would not match the
    // subpaths, and a prefix pattern would swallow them.
    '^@dialstack/sdk-react/(.+)$': '<rootDir>/react/src/$1.ts',
    '^@dialstack/sdk-react$': '<rootDir>/react/src/index.ts',
    // Story fixtures the React stories borrow from the browser package. Not a
    // package specifier because these are internals — mocks and story arg types,
    // deliberately absent from the published entry — and the `#` form says so at
    // the import site rather than making them look like public API.
    '^#storybook-fixtures/types$': '<rootDir>/js/src/__storybook__/types.ts',
    '^#storybook-fixtures/mock-instance$': '<rootDir>/js/src/__mocks__/mock-instance.ts',
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts', '<rootDir>/webrtc/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'js/src/**/*.{ts,tsx}',
    'react/src/**/*.{ts,tsx}',
    'webrtc/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!server/src/**',
    '!src/setupTests.ts',
    '!webrtc/src/setupTests.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
