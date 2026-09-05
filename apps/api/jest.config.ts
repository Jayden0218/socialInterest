import type { Config } from 'jest';

// One project per suite so each can be run alone. The visibility project is
// deliberately separate: it is SC-009, not ordinary coverage.
//
// The ts-jest preset supplies the transform and picks up tsconfig.json from the
// project root, so no explicit transform is configured here.
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@sih/workers$': '<rootDir>/../workers/src/index.ts',
  },
} satisfies Config;

const config: Config = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'] },
    { ...base, displayName: 'contract', testMatch: ['<rootDir>/tests/contract/**/*.spec.ts'] },
    { ...base, displayName: 'visibility', testMatch: ['<rootDir>/tests/visibility/**/*.spec.ts'] },
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'] },
  ],
};
export default config;
