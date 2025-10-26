const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const loadLocalOverrides = () => {
  const localPath = path.join(__dirname, 'app.config.local.json');
  if (!fs.existsSync(localPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[app.config] Failed to parse app.config.local.json:', err);
    return {};
  }
};

module.exports = () => {
  const baseExpoConfig = appJson.expo ?? {};
  const local = loadLocalOverrides();
  const envApiUrl = process.env.EXPO_PUBLIC_API_BASE;

  const mergedExtra = {
    ...(baseExpoConfig.extra ?? {}),
    ...((local.expo && local.expo.extra) || {}),
  };

  if (envApiUrl && envApiUrl.trim().length) {
    mergedExtra.apiUrl = envApiUrl.trim();
  }

  return {
    ...appJson,
    expo: {
      ...baseExpoConfig,
      ...(local.expo ?? {}),
      extra: mergedExtra,
    },
  };
};
