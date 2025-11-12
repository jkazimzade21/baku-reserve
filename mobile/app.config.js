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

module.exports = ({ config } = {}) => {
  const baseExpoConfig = (config && config.expo) || appJson.expo || {};
  const local = loadLocalOverrides();
  const envApiUrl = process.env.EXPO_PUBLIC_API_BASE;
  const envAuth0Domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
  const envAuth0ClientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
  const envAuth0Audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
  const envAuth0Realm = process.env.EXPO_PUBLIC_AUTH0_REALM;
  const envSentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  const mergedExtra = {
    ...(baseExpoConfig.extra ?? {}),
    ...((local.expo && local.expo.extra) || {}),
  };

  mergedExtra.eas = {
    ...(mergedExtra.eas ?? {}),
    projectId: 'c7078790-3e05-4283-82a3-b1911b4a16ea',
  };

  if (envApiUrl && envApiUrl.trim().length) {
    mergedExtra.apiUrl = envApiUrl.trim();
  }

  if (envAuth0Domain && envAuth0Domain.trim().length) {
    mergedExtra.auth0Domain = envAuth0Domain.trim();
  }
  if (envAuth0ClientId && envAuth0ClientId.trim().length) {
    mergedExtra.auth0ClientId = envAuth0ClientId.trim();
  }
  if (envAuth0Audience && envAuth0Audience.trim().length) {
    mergedExtra.auth0Audience = envAuth0Audience.trim();
  }
  if (envAuth0Realm && envAuth0Realm.trim().length) {
    mergedExtra.auth0Realm = envAuth0Realm.trim();
  }
  if (envSentryDsn && envSentryDsn.trim().length) {
    mergedExtra.sentryDsn = envSentryDsn.trim();
  } else if (typeof mergedExtra.sentryDsn === "string") {
    mergedExtra.sentryDsn = mergedExtra.sentryDsn.trim();
  }

  const basePlugins = Array.isArray(baseExpoConfig.plugins) ? baseExpoConfig.plugins : [];
  const localPlugins = Array.isArray(local.expo?.plugins) ? local.expo.plugins : [];
  const pluginEntries = [...basePlugins, ...localPlugins];
  const hasPlugin = (name) =>
    pluginEntries.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);

  if (!hasPlugin('expo-font')) {
    pluginEntries.push('expo-font');
  }

  const mergedPlugins = pluginEntries;

  const rnLegacyPluginPath = './plugins/withRnLegacyPods';
  if (!hasPlugin(rnLegacyPluginPath)) {
    mergedPlugins.push(rnLegacyPluginPath);
  }

  return {
    ...(config || appJson),
    expo: {
      ...baseExpoConfig,
      ...(local.expo ?? {}),
      owner: 'jkazimzade21',
      plugins: mergedPlugins,
      extra: mergedExtra,
    },
  };
};
