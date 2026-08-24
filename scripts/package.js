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
execSync(`node scripts/fix-bundle.js ${out}/${appDir}/resources/app`, { stdio: 'inherit' });

console.log('packaged ->', path.join(out, appDir));
