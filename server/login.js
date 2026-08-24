'use strict';
// Subscription login (Claude, ChatGPT/Codex, Copilot) WITHOUT API keys and
// WITHOUT a terminal: uses pi's SDK OAuth which opens the provider's login
// page in the browser, waits for the loopback callback, and stores the token
// in ~/.pi/agent/auth.json. The app then picks up the provider's models.
const { execSync, exec } = require('child_process');

const CALLBACK_PORT = 53692; // pi's fixed loopback callback port

let cachedSdk = null;

// Free pi's callback port so a previous stuck login can't block a new one.
// Never kills the current server process itself.
function freePort(port) {
  const self = process.pid;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', shell: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m && Number(m[1]) !== self) pids.add(m[1]);
    }
    for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
  } catch (e) { /* port already free */ }
}

async function getSdk(config) {
  if (cachedSdk) return cachedSdk;
  const pkg = config.piCli.replace(/[\\/]dist[\\/]bundle[\\/]cli\.js$/, '');
  cachedSdk = await import('file://' + (pkg + '/dist/index.js').replace(/\\/g, '/'));
  return cachedSdk;
}

// Open the browser without blocking the event loop (so the callback is not missed).
function openUrl(url) {
  if (!url) return;
  const q = String(url).replace(/'/g, "''");
  exec(`powershell -NoProfile -Command "Start-Process '${q}'"`, { shell: true }, () => {});
}

// SDK AuthInteraction: { prompt(), notify() } - opens the browser on the auth
// URL and waits for the loopback callback (manual_code prompt is aborted when
// the callback wins).
function makeInteraction() {
  return {
    prompt: async (p) => {
      if (p.type === 'select') {
        const opts = p.options || [];
        const sub = opts.find((o) => /pro|plus|subscription|max|premium|login/i.test(o.label)) || opts[0];
        return sub ? sub.id : '';
      }
      if (p.type === 'manual_code') {
        if (p.signal) await new Promise((resolve) => p.signal.addEventListener('abort', resolve, { once: true }));
        return '';
      }
      return '';
    },
    notify: (ev) => {
      if (ev.type === 'auth_url' && ev.url) openUrl(ev.url);
      else if (ev.type === 'device_code' && ev.verificationUri) openUrl(ev.verificationUri);
    },
  };
}

// providerId: 'anthropic' | 'openai-codex' | 'github-copilot' | 'xai' | ...
async function login(config, provider, type = 'oauth') {
  freePort(CALLBACK_PORT);
  const sdk = await getSdk(config);
  const runtime = await sdk.ModelRuntime.create();
  return runtime.login(provider, type, makeInteraction());
}

module.exports = { login, freePort, openUrl };
