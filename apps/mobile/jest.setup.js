// 012/FIX-1. See the note in jest.config.js.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
