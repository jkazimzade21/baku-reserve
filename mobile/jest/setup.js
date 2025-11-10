if (typeof global.__DEV__ === 'undefined') {
  global.__DEV__ = true;
}

if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = 'ios';
}

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-auth0', () => {
  return function MockAuth0() {
    return {
      webAuth: {
        authorize: jest.fn(async () => ({ accessToken: 'test-token' })),
        clearSession: jest.fn(async () => undefined),
      },
      auth: {
        userInfo: jest.fn(async () => ({ name: 'Test User', email: 'test@example.com' })),
        passwordRealm: jest.fn(async () => ({ accessToken: 'test-token' })),
      },
    };
  };
});
