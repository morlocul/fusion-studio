'use strict';
// Captures a screenshot of the running Fusion Studio UI via Electron.
// Usage: npx electron scripts/screenshot.js <output.png>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const server = require('../server/index.js');

const OUT = process.argv[2] || path.join(__dirname, '..', 'screenshot.png');

// Returns a JS source string that injects sample chat + fusion content into the page.
function demoSource() {
  return `(() => {
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    const mk = (cls, html) => { const el = document.createElement('div'); el.className = 'msg ' + cls; el.innerHTML = html; chat.appendChild(el); };
    mk('user', 'How do you run several local models at once and combine their answers?');
    mk('assistant', '<div class="who">main</div>Fusion Studio runs every configured model <b>in parallel</b> on the same prompt, then merges their answers — <i>AND, not OR</i>. Just toggle <b>Fusion</b> and the slots work together on your task.');
    const panel = document.createElement('div');
    panel.className = 'fusion-panel';
    panel.innerHTML =
      '<div class="fp-head">\u2726 Fusion</div><div class="fp-body">' +
      '<div class="slot-block"><div class="slot-title" style="color:#A78BFA">arch</div><div class="slot-out">Runs the slots in parallel, then an architect fuses the opinions into one answer.</div></div>' +
      '<div class="slot-block"><div class="slot-title" style="color:#F59E0B">main</div><div class="slot-out">Main handles the interactive chat and the actual coding work with its tools.</div></div>' +
      '<div class="slot-block"><div class="slot-title" style="color:#22D3EE">kimi</div><div class="slot-out">A second builder gives an independent opinion on the same problem.</div></div>' +
      '</div>' +
      '<div class="merge-block"><div class="slot-title" style="color:#3fb950">\u2605 Final merge</div><div class="slot-out">All three models agree: run them together and fuse — AND, not OR.</div></div>';
    chat.appendChild(panel);
  })();`;
}

app.whenReady().then(async () => {
  try {
    await server.start();
    const win = new BrowserWindow({
      width: 1320,
      height: 740,
      show: false,
      webPreferences: { offscreen: true },
    });
    await win.loadURL(`http://127.0.0.1:${server.config.port}`);
    // wait for the sidebar (channels) to build from /api/config
    await new Promise((r) => setTimeout(r, 2500));
    // inject sample content so the screenshot looks alive
    await win.webContents.executeJavaScript(demoSource());
    await new Promise((r) => setTimeout(r, 300));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(OUT, img.toPNG());
    console.log('screenshot written:', OUT);
  } catch (err) {
    console.error('capture failed:', err);
    process.exitCode = 1;
  }
  app.quit();
});
