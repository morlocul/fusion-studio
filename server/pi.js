'use strict';
// pi runner: spawns the pi coding agent non-interactively against Ollama.
const { spawn } = require('child_process');
const fs = require('fs');

// Build CLI args for a non-interactive single-agent pi run.
function buildArgs(model, opts) {
  // model may be "ollama/x" or "openai/gpt-5" or "anthropic/claude-..."; split provider/id.
  const slash = model.indexOf('/');
  const provider = slash > 0 ? model.slice(0, slash) : 'ollama';
  const modelId = slash > 0 ? model.slice(slash + 1) : model;
  const args = ['--provider', provider, '--model', modelId];
  if (opts.sessionId) args.push('--session-id', opts.sessionId);
  if (opts.noSession) args.push('--no-session');
  if (opts.tools) args.push('--tools', opts.tools);
  args.push('-p');
  for (const f of opts.imageFiles || []) args.push('@' + f);
  if (opts.prompt) args.push(opts.prompt);
  return args;
}

// Spawn pi. Returns { child, done }.
//   done resolves { code, stdout, stderr }.
//   opts.onStdout(chunk) / opts.onStderr(chunk) stream output.
function run(model, opts) {
  const cwd = opts.cwd || opts.config.workspaceAbs;
  const args = buildArgs(model, opts);
  const env = { ...process.env, PI_TELEMETRY: '0' };
  const spawnOpts = { cwd, env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] };

  // Prefer an explicit cli.js path; otherwise fall back to `pi` from PATH.
  const cli = opts.config.piCli && fs.existsSync(opts.config.piCli) ? opts.config.piCli : null;
  const child = cli
    ? spawn('node', [cli, ...args], spawnOpts)
    : spawn('pi', args, { ...spawnOpts, shell: true });

  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { stdout += d; if (opts.onStdout) opts.onStdout(d); });
  child.stderr.on('data', (d) => { stderr += d; if (opts.onStderr) opts.onStderr(d); });

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

  return { child, done };
}

module.exports = { run, buildArgs };
