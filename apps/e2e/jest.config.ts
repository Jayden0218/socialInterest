import type { Config } from 'jest';

/**
 * The end-to-end suite. Every journey drives a REAL API over HTTP with a real
 * datastore and object store behind it - see contracts/e2e-journeys.md.
 *
 * runInBand and a long timeout are deliberate: the fixture boots an API process
 * and resets the store between files, and parallel workers would race over both.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/journeys/**/*.spec.ts'],
  testTimeout: 120_000,
  globalSetup: '<rootDir>/support/global-setup.ts',
  globalTeardown: '<rootDir>/support/global-teardown.ts',
  moduleNameMapper: {
    '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@sih/mobile/data$': '<rootDir>/../mobile/src/data/index.ts',
  },
};
export default config;
