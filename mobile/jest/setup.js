if (typeof global.__DEV__ === 'undefined') {
  global.__DEV__ = true;
}

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
