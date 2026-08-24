'use strict';
// Package Fusion Studio for the CURRENT platform (used by GitHub Actions).
// Run on each OS runner (windows/ubuntu/macos) to build that platform's app.
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const platform = { win32: 'win32', linux: 'linux', darwin: 'darwin' }[os.platform()] || 'linux';
const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
const out = 'dist-app';
const appDir = `FusionStudio-${platform}-${arch}`;

execSync(
  `npx electron-packager . FusionStudio --platform=${platform} --arch=${arch} --asar=false --out=${out} --overwrite --ignore "dist" --ignore "workspace" --ignore ".git"`,
  { stdio: 'inherit' }
);

// macOS builds a .app bundle; resources live inside it.
const appResources = platform === 'darwin'
  ? `${out}/${appDir}/FusionStudio.app/Contents/Resources/app`
  : `${out}/${appDir}/resources/app`;
execSync(`node scripts/fix-bundle.js ${appResources}`, { stdio: 'inherit' });

// Zip the built app into a single archive for release upload.
const zipName = `fusion-studio-${platform}-${arch}.zip`;
const zipDir = platform === 'darwin' ? `${out}/${appDir}/FusionStudio.app` : `${out}/${appDir}`;
if (platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${zipDir}\\*' -DestinationPath '${zipName}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd ${zipDir} && zip -r ../../${zipName} .`, { stdio: 'inherit' });
}

console.log('packaged ->', zipDir, '=>', zipName);
