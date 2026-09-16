module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^@sih/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  /**
   * 012/FIX-1. `SafeAreaProvider` MEASURES before it renders its children, and
   * RNTL performs no layout — so under jest it renders an empty
   * `<RNCSafeAreaProvider />` and every screen inside it disappears. That took
   * the whole shell suite down the moment the real safe area was wired in.
   *
   * The library ships this mock for exactly that reason: it supplies static
   * insets so children render. Using the vendor's own mock rather than a
   * hand-written stub is deliberate — 007's `ApiPage<T>` defect hid for five
   * features inside hand-written stubs that agreed with the tests and not with
   * the real thing.
   *
   * It also means these tests say NOTHING about whether the insets are correct
   * on a device. They cannot: there is no status bar here. That claim belongs
   * to a device run, and `safe-area-is-real.test.ts` covers the part that is
   * checkable from here — that the import comes from the package that works on
   * Android at all.
   */
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-safe-area-context|react-native-svg))',
  ],
};
