'use strict';
// Manage provider API keys in pi's auth.json (~/.pi/agent/auth.json).
const fs = require('fs');
const os = require('os');
const path = require('path');

function authJsonPath(config) {
  if (config.authJson) return config.authJson;
  return path.join(os.homedir(), '.pi', 'agent', 'auth.json');
}

function readAuth(config) {
  const p = authJsonPath(config);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

// Merge the given provider -> api key map into pi's auth.json.
function setApiKeys(config, keys) {
  const p = authJsonPath(config);
  const auth = readAuth(config);
  let changed = false;
  for (const [provider, key] of Object.entries(keys || {})) {
    if (key && typeof key === 'string' && key.trim()) {
      auth[provider] = { type: 'api_key', key: key.trim() };
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(auth, null, 2));
  return { path: p, changed };
}

// Which providers have any credential configured (key or oauth)?
function configuredProviders(config) {
  const auth = readAuth(config);
  return Object.keys(auth).reduce((acc, k) => { acc[k] = true; return acc; }, {});
}

module.exports = { authJsonPath, readAuth, setApiKeys, configuredProviders };
