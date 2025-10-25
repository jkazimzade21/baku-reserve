const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transform: {
    ...expoPreset.transform,
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo', '@babel/preset-flow'],
        plugins: ['@babel/plugin-transform-flow-strip-types'],
      },
    ],
  },
  transformIgnorePatterns: [
    ...expoPreset.transformIgnorePatterns,
    'node_modules/(?!(?:react-native|@react-native|expo(nent)?|@expo(nent)?|expo-modules-core|react-clone-referenced-element|@react-navigation|@testing-library)/)',
  ],
};
