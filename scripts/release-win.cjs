const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const { version, productName } = require('../package.json');
const targets = { portable: 'zip', installer: 'squirrel', all: 'zip,squirrel' };

async function main() {
  const mode = process.argv[2];
  if (!Object.hasOwn(targets, mode)) {
    throw new Error('Usage: node scripts/release-win.cjs <portable|installer|all>');
  }
  if (process.platform !== 'win32') {
    throw new Error('Run Windows release builds on Windows.');
  }

  const result = spawnSync(process.execPath, [
    require.resolve('@electron-forge/cli/dist/electron-forge.js'),
    'make', '--platform', 'win32', '--arch', 'x64', '--targets', targets[mode],
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Electron Forge failed (${result.signal || result.status}).`);
  }

  const outputDir = path.join(projectRoot, 'release', version);
  const artifacts = [];
  if (mode !== 'installer') {
    artifacts.push({
      source: path.join(projectRoot, 'out/make/zip/win32/x64', `${productName}-win32-x64-${version}.zip`),
      name: `${productName}-${version}-win-x64-portable.zip`,
    });
  }
  if (mode !== 'portable') {
    const installerDir = path.join(projectRoot, 'out/make/squirrel.windows/x64');
    const files = await fs.readdir(installerDir);
    const setup = files.find((name) => name.endsWith('Setup.exe'));
    const packages = files.filter((name) => name.endsWith('.nupkg'));
    if (!setup || packages.length === 0 || !files.includes('RELEASES')) {
      throw new Error('Squirrel installer artifacts are incomplete.');
    }
    artifacts.push({
      source: path.join(installerDir, setup),
      name: `${productName}-${version}-win-x64-setup.exe`,
    });
    // RELEASES refers to the original NuGet filenames.
    for (const name of [...packages, 'RELEASES']) {
      artifacts.push({ source: path.join(installerDir, name), name });
    }
  }

  await fs.mkdir(outputDir, { recursive: true });
  for (const { source, name } of artifacts) {
    const destination = path.join(outputDir, name);
    await fs.copyFile(source, destination);
    console.log(`Release artifact: ${destination}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
