'use strict';
// Fusion Studio server - Express + pi (Ollama) + file attachment.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { extractUpload } = require('./extract');
const { run } = require('./pi');
const ollama = require('./ollama');
const catalog = require('./catalog');
const auth = require('./auth');
const loginSdk = require('./login');

// ---- config ----
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
  console.error('config.json invalid:', e.message);
  process.exit(1);
}
config.workspaceAbs = process.env.FUSION_WORKSPACE
  ? path.resolve(process.env.FUSION_WORKSPACE)
  : (config.workspace && path.isAbsolute(config.workspace)
      ? path.resolve(config.workspace)
      : path.resolve(path.join(__dirname, '..', config.workspace || 'workspace')));
fs.mkdirSync(config.workspaceAbs, { recursive: true });
function getUploadDir() {
  const d = path.join(config.workspaceAbs, '.uploads');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const visionModel = () => config.imageModel || 'ollama/qwen3.5:397b-cloud';

// Map a permission mode to pi's tool allowlist.
//   plan      -> read-only
//   workspace -> edit within the workspace, no shell
//   full      -> all tools (default)
function toolsForMode(mode) {
  if (mode === 'plan') return 'read,grep,find,ls';
  if (mode === 'workspace') return 'read,grep,find,ls,edit,write';
  return undefined; // undefined = all tools
}

// ---- describe an image using a vision model via Ollama /v1 ----
async function describeImage(imagePath, name) {
  const ext = path.extname(imagePath) || '.png';
  const mime = ext === '.jpg' ? 'image/jpeg' : ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png';
  const b64 = fs.readFileSync(imagePath).toString('base64');
  const body = {
    model: visionModel().replace(/^ollama\//, ''),
    stream: false,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image in detail, in English. Mention all visible text, colors, objects and what is happening. Be complete and specific.' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
      ],
    }],
  };
  const host = (config.ollamaHost || 'http://localhost:11434').replace(/\/+$/, '');
  const r = await fetch(host + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  const text = (msg && (msg.content || msg.reasoning_content)) || '(vision model returned no description)';
  return `[Image attached: ${name}]\nDescription by vision model (${visionModel()}):\n${text}`;
}

// ---- process uploaded files into prompt blocks + image paths ----
async function processFiles(files) {
  const blocks = [];
  const imageFiles = [];
  for (const f of files || []) {
    const base = crypto.randomBytes(6).toString('hex') + '-' + path.basename(f.originalname || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
    const res = await extractUpload(f, getUploadDir(), base);
    if (res.kind === 'image') {
      imageFiles.push({ path: res.path, name: f.originalname });
      blocks.push(`[Image attached: ${f.originalname}]`);
    } else if (res.kind === 'text') {
      blocks.push(`\n=== Attached file: ${res.sourceName || f.originalname} ===\n${res.text}`);
    } else {
      blocks.push(`[Attached file: ${f.originalname}] (${res.ext}) - saved at ${res.path}`);
    }
  }
  return { blocks, imageFiles };
}

function buildPrompt(message, att, extra) {
  let p = message || '';
  const extraArr = [];
  if (att.blocks.length) extraArr.push(att.blocks.join('\n'));
  if (extra) extraArr.push(extra);
  if (extraArr.length) p = p ? p + '\n\n' + extraArr.join('\n\n') : extraArr.join('\n\n');
  return p;
}

// Caption all attached images via the vision model (for slots that cannot see images).
async function describeAllImages(att) {
  if (!att.imageFiles.length) return '';
  let s = '\n=== Attached images ===\n';
  for (const img of att.imageFiles) {
    try { s += (await describeImage(img.path, img.name)) + '\n'; }
    catch (e) { s += `[could not describe ${img.name}: ${e.message}]\n`; }
  }
  return s;
}

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  return { send };
}

// ---- /api/config ----
app.get('/api/config', (req, res) => {
  res.json({ slots: config.slots, imageModel: visionModel(), workspace: config.workspaceAbs });
});

// ---- /api/login - launch pi's subscription login (opens browser) ----
app.post('/api/login', (req, res) => {
  const provider = req.body && req.body.provider;
  if (!provider) return res.status(400).json({ ok: false, error: 'provider required' });
  loginSdk.launchLogin(config, provider);
  res.json({ ok: true, started: true, provider, note: 'A pi login window opened - complete the sign-in in the browser, then close that window. The app picks it up automatically.' });
});

// ---- /api/models - available models across all pi providers ----
app.get('/api/models', async (req, res) => {
  try { res.json({ ok: true, models: await catalog.listModels(config) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---- /api/settings - GET current settings, POST to save ----
app.get('/api/settings', async (req, res) => {
  const models = await catalog.listModels(config);
  const configured = auth.configuredProviders(config);
  res.json({ ok: true, settings: {
    ollamaHost: config.ollamaHost,
    imageModel: config.imageModel,
    permissionMode: config.permissionMode || 'full',
    workspace: config.workspaceAbs,
    slots: config.slots,
    authJson: auth.authJsonPath(config),
    configuredProviders: configured,
    providers: [...new Set(models.map((m) => m.provider))].sort(),
  } });
});

app.post('/api/settings', async (req, res) => {
  const body = req.body || {};
  const slots = body.slots;
  const imageModel = body.imageModel;
  const ollamaHost = body.ollamaHost;
  const apiKeys = body.apiKeys;
  const workspace = body.workspace;
  const permissionMode = body.permissionMode;

  if (Array.isArray(slots)) {
    if (slots.length < 2 || slots.length > 5) {
      return res.status(400).json({ ok: false, error: 'Need 2-5 slots.' });
    }
    const arch = slots.filter((s) => s.role === 'architect').length;
    const prim = slots.filter((s) => s.role === 'primary').length;
    if (arch !== 1 || prim !== 1) {
      return res.status(400).json({ ok: false, error: 'Exactly one architect and one primary.' });
    }
    const valid = slots.every((s) => s && s.name && s.model);
    if (!valid) return res.status(400).json({ ok: false, error: 'Invalid slot.' });
    // auto-derive vision from the catalog
    const models = await catalog.listModels(config);
    const byId = new Map(models.map((m) => [m.id, m]));
    config.slots = slots.map((s) => ({ ...s, vision: !!(byId.get(s.model) || {}).vision }));
  }
  if (typeof imageModel === 'string' && imageModel) config.imageModel = imageModel;
  if (typeof ollamaHost === 'string' && ollamaHost) {
    config.ollamaHost = ollamaHost;
    ollama.updateModelsHost(config);
  }
  if (apiKeys && typeof apiKeys === 'object') {
    try { auth.setApiKeys(config, apiKeys); }
    catch (e) { return res.status(500).json({ ok: false, error: 'Could not save API keys: ' + e.message }); }
  }
  if (typeof workspace === 'string' && workspace.trim()) {
    config.workspace = workspace.trim();
    config.workspaceAbs = path.resolve(workspace.trim());
    fs.mkdirSync(config.workspaceAbs, { recursive: true });
  }
  if (['plan', 'workspace', 'full'].includes(permissionMode)) config.permissionMode = permissionMode;

  try { fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2)); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Could not save: ' + e.message }); }

  res.json({ ok: true, settings: config.slots, imageModel: config.imageModel, ollamaHost: config.ollamaHost, workspace: config.workspaceAbs, permissionMode: config.permissionMode });
});

// ---- /api/chat - Main agent, streaming ----
app.post('/api/chat', upload.array('files', 12), async (req, res) => {
  const message = (req.body && (req.body.message || '')) || '';
  const { send } = sse(res);
  let att;
  try { att = await processFiles(req.files || []); }
  catch (err) { send({ type: 'error', message: 'Error processing files: ' + err.message }); return res.end(); }

  const primary = config.slots.find((s) => s.role === 'primary') || config.slots[0];
  const hasImages = att.imageFiles.length > 0;
  // Images go DIRECTLY to a vision model; text-only turns use the primary builder.
  const model = hasImages ? config.imageModel : primary.model;
  send({ type: 'meta', slot: 'main', model });

  const prompt = buildPrompt(message, att); // vision model sees the image itself
  const sessionId = req.body && req.body.sessionId;

  const { child, done } = run(model, {
    config,
    prompt,
    sessionId: sessionId || undefined,
    imageFiles: att.imageFiles.map((i) => i.path),
    tools: toolsForMode(config.permissionMode),
    onStdout: (d) => send({ type: 'delta', slot: 'main', text: d }),
  });
  req.on('close', () => { try { child.kill(); } catch (e) {} });
  const out = await done;
  send({ type: 'done', slot: 'main', code: out.code });
  return res.end();
});

// ---- /api/fusion - run each slot read-only in parallel ----
app.post('/api/fusion', upload.array('files', 50), async (req, res) => {
  const message = (req.body && (req.body.message || '')) || '';
  const { send } = sse(res);
  send({ type: 'meta', mode: 'fusion', slots: config.slots.map((s) => s.name) });

  let att;
  try { att = await processFiles(req.files || []); }
  catch (err) { send({ type: 'error', message: 'Error processing files: ' + err.message }); return res.end(); }

  // For non-vision slots, embed a vision caption; vision slots get the image directly.
  const visionDesc = await describeAllImages(att);

  const jobs = config.slots.map((slot, i) => {
    const vision = !!slot.vision;
    const slotPrompt = buildPrompt(message, att, vision ? '' : visionDesc);
    const slotImg = vision ? att.imageFiles.map((x) => x.path) : [];
    const { child, done } = run(slot.model, {
      config,
      prompt: slotPrompt,
      tools: 'read,grep,find,ls',
      noSession: true,
      imageFiles: slotImg,
      onStdout: (d) => send({ type: 'delta', slot: slot.name, text: d }),
    });
    send({ type: 'slot-start', slot: slot.name, model: slot.model, vision });
    return done.then((out) => ({ slot: slot.name, out }));
  });

  req.on('close', () => { /* children are tracked below */ });
  let results;
  try { results = await Promise.all(jobs); }
  catch (err) { send({ type: 'error', message: 'Fusion failed: ' + err.message }); return res.end(); }

  for (const r of results) send({ type: 'slot-done', slot: r.slot, code: r.code });

  // optional merge with architect (full tools)
  if (req.body && req.body.merge === '1') {
    const arch = config.slots.find((s) => s.role === 'architect') || config.slots[0];
    const mergedText = results.map((r) => `### Opinia [${r.slot}]\n${(r.out.stdout || '').trim()}`).join('\n\n');
    const mergePrompt = `Fuse the opinions of several models into one clear, concise final answer.\n\nQ: ${message}\n\n${mergedText}`;
    send({ type: 'merge-start', slot: arch.name, model: arch.model });
    const { child, done } = run(arch.model, { config, prompt: mergePrompt, noSession: true, onStdout: (d) => send({ type: 'delta', slot: 'merge', text: d }) });
    const out = await done;
    send({ type: 'merge-done', slot: arch.name, code: out.code });
  }

  send({ type: 'done', mode: 'fusion' });
  return res.end();
});

const PORT = config.port || 3090;

function start() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, config.host, () => {
      console.log(`Fusion Studio -> http://${config.host}:${PORT}`);
      console.log(`Workspace: ${config.workspaceAbs}`);
      resolve(server);
    });
  });
}

// Start automatically only when run directly (node server/index.js).
if (require.main === module) {
  start();
}

module.exports = { app, config, start };
