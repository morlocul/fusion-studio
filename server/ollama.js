'use strict';
// Ollama model listing + models.json helpers for the Settings UI.
const fs = require('fs');

async function listModels(config) {
  const host = (config.ollamaHost || 'http://localhost:11434').replace(/\/+$/, '');
  let tags = [];
  try {
    const r = await fetch(host + '/api/tags');
    if (r.ok) { const j = await r.json(); tags = j.models || []; }
  } catch (e) { tags = []; }
  const meta = loadMeta(config);
  const list = tags.map((m) => {
    const caps = m.capabilities || [];
    const det = m.details || {};
    const mm = meta[m.name] || {};
    return {
      id: 'ollama/' + m.name,
      name: m.name,
      context: det.context_length || mm.contextWindow || null,
      vision: caps.includes('vision') || !!(mm.input && mm.input.includes('image')),
      reasoning: caps.includes('thinking') || !!mm.reasoning,
    };
  });
  // Fallback: if Ollama is unreachable, list what models.json knows.
  if (!list.length) {
    for (const id of Object.keys(meta)) {
      const m = meta[id];
      list.push({
        id: 'ollama/' + id,
        name: id,
        context: m.contextWindow || null,
        vision: !!(m.input && m.input.includes('image')),
        reasoning: !!m.reasoning,
      });
    }
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function loadMeta(config) {
  const map = {};
  try {
    const j = JSON.parse(fs.readFileSync(config.modelsJson, 'utf8'));
    const prov = j.providers && j.providers.ollama;
    if (prov && prov.models) {
      for (const m of prov.models) {
        map[m.id] = { contextWindow: m.contextWindow, input: m.input, reasoning: m.reasoning };
      }
    }
  } catch (e) {}
  return map;
}

// Point pi's ollama provider at config.ollamaHost.
function updateModelsHost(config) {
  try {
    const p = config.modelsJson;
    if (!fs.existsSync(p)) return false;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.providers && j.providers.ollama) {
      j.providers.ollama.baseUrl = (config.ollamaHost || 'http://localhost:11434').replace(/\/+$/, '') + '/v1';
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      return true;
    }
  } catch (e) {}
  return false;
}

module.exports = { listModels, loadMeta, updateModelsHost };
