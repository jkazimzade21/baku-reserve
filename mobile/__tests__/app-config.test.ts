describe('Expo app.config', () => {
  const mockFsModule = () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(),
    }));
  };

  const loadConfig = () => {
    const configFactory = require('../app.config.js'); // eslint-disable-line @typescript-eslint/no-var-requires
    return configFactory();
  };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_API_BASE;
  });

  afterEach(() => {
    jest.dontMock('fs');
  });

  it('applies EXPO_PUBLIC_API_BASE to expo.extra.apiUrl when present', () => {
    mockFsModule();
    process.env.EXPO_PUBLIC_API_BASE = 'http://api.from.env:1234';
    const config = loadConfig();
    expect(config.expo.extra.apiUrl).toBe('http://api.from.env:1234');
  });

  it('retains default extra when env override is absent', () => {
    mockFsModule();
    const config = loadConfig();
    expect(config.expo.extra.apiUrl).toBeNull();
  });
});
