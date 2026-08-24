'use strict';
// Fusion Studio - desktop shell (Electron). Embeds the local server in a native window.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Use a stable user-data workspace (not the bundled app dir).
process.env.FUSION_WORKSPACE = path.join(app.getPath('userData'), 'workspace');

const server = require(path.join(__dirname, '..', 'server', 'index.js'));

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 560,
    title: 'Fusion Studio',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const url = `http://127.0.0.1:${server.config.port}`;
  win.loadURL(url);
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  try {
    await server.start();
    createWindow();
  } catch (err) {
    console.error('Fusion Studio nu a pornit:', err);
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
