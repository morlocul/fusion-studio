'use strict';
// Lightweight smoke test — no server, no Ollama needed.
// Verifies the example config schema and that the core modules load.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. example config is valid and has the required slot roles
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'config.example.json'), 'utf8'));
assert.ok(cfg.slots.length >= 2 && cfg.slots.length <= 5, 'expected 2-5 slots');
assert.strictEqual(cfg.slots.filter((s) => s.role === 'architect').length, 1, 'exactly one architect');
assert.strictEqual(cfg.slots.filter((s) => s.role === 'primary').length, 1, 'exactly one primary');
for (const s of cfg.slots) {
  assert.ok(s.name && s.model, 'each slot has name + model');
}

// 2. core server modules load without throwing
require('../server/extract.js');
require('../server/pi.js');
require('../server/ollama.js');
require('../server/catalog.js');
require('../server/auth.js');

console.log('smoke test passed: config valid, modules load');
