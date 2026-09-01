const { spawnSync } = require('node:child_process');

const electronPath = require('electron');
const testArgs = process.argv.slice(2);
const result = spawnSync(
  electronPath,
  ['--test', '--require', 'tsx/cjs', ...testArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
