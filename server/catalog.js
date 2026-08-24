'use strict';
// Model catalog across ALL pi providers (ollama, openai, anthropic, ...).
// Parses `pi --list-models`; falls back to Ollama /api/tags when pi has no catalog.
const { execFileSync } = require('child_process');
const fs = require('fs');

function parseCtx(s) {
  if (!s) return null;
  const m = String(s).toUpperCase();
  if (m.includes('M')) return Math.round(parseFloat(m) * 1048576);
  if (m.includes('K')) return Math.round(parseFloat(m) * 1024);
  const n = parseFloat(m);
  return isNaN(n) ? null : n;
}

function listPiModels(config) {
  const cli = config.piCli && fs.existsSync(config.piCli) ? config.piCli : null;
  let out = '';
  try {
    if (cli) out = execFileSync('node', [cli, '--list-models'], { encoding: 'utf8', timeout: 40000 });
    else out = execFileSync('pi', ['--list-models'], { encoding: 'utf8', timeout: 40000, shell: true });
  } catch (e) { return []; }

  const models = [];
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^provider\s/i.test(line) || /^-+/.test(line)) continue;
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const [provider, name, ctx, maxOut, thinking, images] = parts;
    models.push({
      id: provider + '/' + name,
      provider,
      name,
      context: parseCtx(ctx),
      maxOut: parseCtx(maxOut),
      thinking: thinking === 'yes',
      vision: images === 'yes',
    });
  }
  return models;
}

// Fallback: list models straight from Ollama when pi's catalog is empty.
async function listOllamaModels(config) {
  const host = (config.ollamaHost || 'http://localhost:11434').replace(/\/+$/, '');
  try {
    const r = await fetch(host + '/api/tags');
    const j = await r.json();
    return (j.models || []).map((m) => ({
      id: 'ollama/' + m.name,
      provider: 'ollama',
      name: m.name,
      context: m.details && m.details.context_length || null,
      thinking: (m.capabilities || []).includes('thinking'),
      vision: (m.capabilities || []).includes('vision'),
    }));
  } catch (e) { return []; }
}

async function listModels(config) {
  const piModels = listPiModels(config);
  if (piModels.length) return piModels;
  return listOllamaModels(config);
}

module.exports = { listModels, listPiModels };
