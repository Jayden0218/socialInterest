module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*))',
  ],
};
