'use strict';
// Captures a demo GIF sequence: opens the app, injects an animated demo state
// (streaming message + fusion panel) per frame, saves PNG frames. No personal
// data - the workspace label is replaced with a generic placeholder.
// Usage: npx electron scripts/gifcapture.js <outDir>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const server = require('../server/index.js');

const OUT = process.argv[2] || path.join(__dirname, '..', 'demo_frames');
const TOTAL = 30;
const TEXT = 'Fusion Studio runs several models in parallel on the same task and fuses their answers - AND, not OR.';
const SLOTS = {
  arch: 'Runs the slots in parallel, then an architect fuses the opinions into one answer.',
  main: 'Main handles the interactive chat and the actual coding work with its tools.',
  kimi: 'A second builder gives an independent opinion on the same problem.',
};

// Build a JS string that renders the demo DOM for a given frame.
function demoJS(frame) {
  const q = JSON.stringify;
  const streamLen = Math.floor(TEXT.length * Math.min(frame, 13) / 13);
  const streamText = TEXT.slice(0, streamLen) + (frame < 13 ? '▊' : '');
  // fusion phase: slot fill ratio based on frame
  const slotFill = (idx, start, span) => {
    const p = (frame - start) / span;
    return Math.max(0, Math.min(1, p)) * idx;
  };
  const showFusion = frame >= 13;
  const showMerge = frame >= 26;
  const farch = showFusion ? SLOTS.arch.slice(0, Math.floor(SLOTS.arch.length * slotFill(1, 13, 6))) : '';
  const fmain = showFusion ? SLOTS.main.slice(0, Math.floor(SLOTS.main.length * slotFill(1, 16, 6))) : '';
  const fkimi = showFusion ? SLOTS.kimi.slice(0, Math.floor(SLOTS.kimi.length * slotFill(1, 19, 6))) : '';
  const fmerge = showMerge ? 'All three models agree: run them together and fuse - AND, not OR.' : '';
  const onArch = showFusion && frame >= 13 && frame < 26;
  const onMain = showFusion && frame >= 16 && frame < 26;
  const onKimi = showFusion && frame >= 19 && frame < 26;
  const onAll = frame >= 26;

  return `(() => {
    const el = (id) => document.getElementById(id);
    el('workspaceInfo').textContent = '~/workspace';
    const setOn = (sel, on) => { const c = document.querySelector(sel); if (c) c.classList.toggle('on', !!on); };
    if (${q(onAll)}) { document.querySelectorAll('.channel').forEach((c) => c.classList.add('on')); }
    else { setOn('.channel.role-architect', ${q(onArch)}); setOn('.channel.role-primary', ${q(onMain)}); setOn('.channel.role-builder', ${q(onKimi)}); }
    const chat = el('chat');
    chat.innerHTML = '';
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; chat.appendChild(d); };
    mk('msg user', 'How do you run several models at once and combine their answers?');
    mk('msg assistant', '<div class="who">main</div>' + ${q(streamText)});
    if (${q(showFusion)}) {
      const panel = document.createElement('div');
      panel.className = 'fusion-panel';
      panel.innerHTML =
        '<div class="fp-head">\u2726 Fusion</div><div class="fp-body">' +
        '<div class="slot-block"><div class="slot-title" style="color:#A78BFA">arch</div><div class="slot-out">' + ${q(farch)} + '</div></div>' +
        '<div class="slot-block"><div class="slot-title" style="color:#F59E0B">main</div><div class="slot-out">' + ${q(fmain)} + '</div></div>' +
        '<div class="slot-block"><div class="slot-title" style="color:#22D3EE">kimi</div><div class="slot-out">' + ${q(fkimi)} + '</div></div>' +
        '</div>' +
        ${q(showMerge)} ? '<div class="merge-block"><div class="slot-title" style="color:#3fb950">\u2605 Final merge</div><div class="slot-out">' + ${q(fmerge)} + '</div></div>' : '';
      chat.appendChild(panel);
    }
  })()`;
}

app.whenReady().then(async () => {
  try {
    await server.start();
    fs.mkdirSync(OUT, { recursive: true });
    const win = new BrowserWindow({ width: 1200, height: 700, show: false, webPreferences: { offscreen: true } });
    await win.loadURL(`http://127.0.0.1:${server.config.port}`);
    await new Promise((r) => setTimeout(r, 2000)); // let channels build
    for (let f = 0; f < TOTAL; f++) {
      await win.webContents.executeJavaScript(demoJS(f));
      await new Promise((r) => setTimeout(r, 130));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, 'f' + String(f).padStart(3, '0') + '.png'), img.toPNG());
    }
    console.log('frames written to', OUT);
  } catch (e) { console.error('gif capture failed:', e); process.exitCode = 1; }
  app.quit();
});
