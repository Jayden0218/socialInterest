import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  moduleNameMapper: { '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
};
export default config;
