const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createReadStream, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const { version, productName } = require('../package.json');
const modes = new Set(['portable', 'installer', 'all']);

function findCompiler() {
  if (process.env.INNO_SETUP_PATH) return process.env.INNO_SETUP_PATH;
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(process.env.LOCALAPPDATA || '', 'Programs')]) {
    if (!root) continue;
    for (const version of [7, 6]) {
      const candidate = path.join(root, `Inno Setup ${version}`, 'ISCC.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'ISCC.exe';
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: projectRoot, stdio: 'inherit', ...options });
  if (result.error?.code === 'ENOENT' && path.basename(file).toLowerCase() === 'iscc.exe') {
    throw new Error('Install Inno Setup or set INNO_SETUP_PATH to the full path to ISCC.exe.');
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.signal || result.status}).`);
  return result.stdout;
}

async function main() {
  const mode = process.argv[2];
  if (!modes.has(mode)) {
    throw new Error('Usage: node scripts/release-win.cjs <portable|installer|all>');
  }
  if (process.platform !== 'win32') {
    throw new Error('Run Windows release builds on Windows.');
  }

  const compiler = mode === 'portable' ? null : findCompiler();
  const outputDir = path.join(projectRoot, 'release', version);
  await fs.mkdir(outputDir, { recursive: true });
  run(process.execPath, [
    require.resolve('@electron-forge/cli/dist/electron-forge.js'),
    mode === 'installer' ? 'package' : 'make', '--platform', 'win32', '--arch', 'x64',
    ...(mode === 'installer' ? [] : ['--targets', 'zip']),
  ]);

  if (mode !== 'installer') {
    const destination = path.join(outputDir, `${productName}-${version}-win-x64-portable.zip`);
    await fs.copyFile(path.join(projectRoot, 'out/make/zip/win32/x64', `${productName}-win32-x64-${version}.zip`), destination);
    console.log(`Release artifact: ${destination}`);
  }
  if (compiler) {
    run(compiler, [`/DPinVersion=${version}`, `/O${outputDir}`, path.join(projectRoot, 'installer/windows.iss')]);
    console.log(`Release artifact: ${path.join(outputDir, `${productName}-${version}-win-x64-setup.exe`)}`);
  }
  // Include only the two user-facing artifacts. Partial builds keep the other
  // existing file in the same version's checksum list if it has been built.
  const checksums = [];
  for (const type of ['portable.zip', 'setup.exe']) {
    const name = `${productName}-${version}-win-x64-${type}`;
    const hash = createHash('sha256');
    try {
      for await (const chunk of createReadStream(path.join(outputDir, name))) hash.update(chunk);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(outputDir, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
