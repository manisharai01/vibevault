// Metro configuration (Expo defaults) plus one fix.
//
// EXPO_PUBLIC_* values (from .env or the environment) are inlined into the code when Metro
// transforms each file, but Metro's cache doesn't know about them: after changing .env — or
// after `npm run e2e`, which builds against a test backend — the next build would silently reuse
// the old values. Every transformer setting is part of Metro's cache key, so adding a hash of the
// values here means a different value always gets a fresh transform.

const crypto = require('node:crypto');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const publicEnv = Object.keys(process.env)
  // Set by the Expo CLI itself (an absolute path); not app configuration.
  .filter((key) => key.startsWith('EXPO_PUBLIC_') && key !== 'EXPO_PUBLIC_PROJECT_ROOT')
  .sort()
  .map((key) => `${key}=${process.env[key]}`)
  .join('\n');

config.transformer = {
  ...config.transformer,
  expoPublicEnvHash: crypto.createHash('sha256').update(publicEnv).digest('hex'),
};

module.exports = config;
