import type { Config } from 'jest';

/**
 * Durability runs ALONE, in its own jest invocation, and never as part of the
 * ordinary suite.
 *
 * It stops and restarts the containers the whole harness shares. Run alongside
 * the journeys, it pulls the datastore out from under them - the first attempt
 * hung the entire e2e run and timed out the API suite in a separate process
 * that happened to be using the same stack. A test that destroys shared
 * infrastructure has to own it for the duration.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/durability/**/*.spec.ts'],
  testTimeout: 600_000,
  globalSetup: '<rootDir>/support/global-setup.ts',
  globalTeardown: '<rootDir>/support/global-teardown.ts',
  moduleNameMapper: {
    '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@sih/mobile/data$': '<rootDir>/../mobile/src/data/index.ts',
  },
};
export default config;
