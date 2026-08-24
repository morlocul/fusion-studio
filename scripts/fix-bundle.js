'use strict';
// Repair a packaged Electron bundle: electron-packager sometimes copies a dependency
// without all its files (e.g. dingbat-to-unicode/dist). For every runtime package already
// present in the bundle's node_modules, merge any files missing from the source node_modules.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules');
const BUNDLE = process.argv[2];
if (!BUNDLE) { console.error('usage: node scripts/fix-bundle.js <bundle-path>'); process.exit(2); }
const DST = path.join(BUNDLE, 'node_modules');
if (!fs.existsSync(DST)) { console.error('bundle node_modules missing:', DST); process.exit(2); }

let copied = 0;
function walk(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); }
      walk(s, d);
    } else {
      if (!fs.existsSync(d)) { fs.copyFileSync(s, d); copied++; }
    }
  }
}

// For each package dir present in both source and bundle, merge missing files.
for (const entry of fs.readdirSync(DST, { withFileTypes: true })) {
  const dstPkg = path.join(DST, entry.name);
  if (!entry.isDirectory()) continue;
  const srcPkg = path.join(SRC, entry.name);
  if (!fs.existsSync(srcPkg)) continue;
  walk(srcPkg, dstPkg);
}

console.log(`fix-bundle: merged ${copied} missing files into ${DST}`);
