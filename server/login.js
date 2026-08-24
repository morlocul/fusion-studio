'use strict';
// Login for subscription providers (Claude, ChatGPT, Copilot).
// Uses pi's own `/login` flow, which is reliable and stores the token in
// ~/.pi/agent/auth.json. Launches pi in a small console that opens the
// provider's login page in the browser; the app picks up the token after.
const { spawn } = require('child_process');
const fs = require('fs');

// providerId: 'anthropic' | 'openai-codex' | 'github-copilot' | 'xai' | ...
function launchLogin(config, provider) {
  const cli = config.piCli && fs.existsSync(config.piCli) ? config.piCli : 'pi';
  const cmd = `start "Fusion Studio - pi login" cmd /k node "${cli}" "/login ${provider}"`;
  // detached + stdio ignore so the caller returns immediately
  const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
  if (child.unref) child.unref();
  return true;
}

module.exports = { launchLogin };
