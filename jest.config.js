/** @type {import('jest').Config} */
export default {
  // One suite spanning src/ plus each per-audience tree the sources moved into.
  roots: ['<rootDir>/src', '<rootDir>/js/src', '<rootDir>/react/src', '<rootDir>/webrtc/src', '<rootDir>/server/src'],
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
    '^@dialstack/sdk/react$': '<rootDir>/src/react.ts',
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'js/src/**/*.{ts,tsx}',
    'react/src/**/*.{ts,tsx}',
    'webrtc/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!src/server/**',
    '!server/src/**',
    '!src/setupTests.ts',
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
