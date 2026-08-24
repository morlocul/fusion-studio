'use strict';
// Run the provider CLIs (claude / codex / gemini) non-interactively as hosts.
// Each uses its own subscription login (no API key needed in Fusion Studio).
const { spawn } = require('child_process');

// host -> CLI command + args for a single non-interactive turn.
function buildArgs(host, prompt, mode) {
  const readOnly = mode === 'plan';
  if (host === 'claude') {
    const a = ['-p', prompt, '--output-format', 'text', '--dangerously-skip-permissions'];
    if (readOnly) a.push('--permission-mode', 'plan');
    return { cmd: 'claude', args: a };
  }
  if (host === 'codex') {
    const a = ['exec', prompt, '--json', 'false'];
    return { cmd: 'codex', args: a };
  }
  if (host === 'gemini') {
    const a = ['-p', prompt];
    if (readOnly) a.push('--approval-mode', 'plan');
    return { cmd: 'gemini', args: a };
  }
  return null;
}

// Run one CLI turn. Resolves { code, stdout, stderr }.
function runCli(host, prompt, opts = {}) {
  const spec = buildArgs(host, prompt, opts.mode);
  if (!spec) return Promise.reject(new Error('Unknown CLI host: ' + host));
  return new Promise((resolve, reject) => {
    const child = spawn(spec.cmd, spec.args, { shell: true, env: { ...process.env } });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; if (opts.onStdout) opts.onStdout(d); });
    child.stderr.on('data', (d) => { stderr += d; if (opts.onStderr) opts.onStderr(d); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const CLI_HOSTS = ['claude', 'codex', 'gemini'];
module.exports = { runCli, buildArgs, CLI_HOSTS };
