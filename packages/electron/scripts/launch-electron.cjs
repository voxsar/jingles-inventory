const { spawn } = require('child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronBinary = require('electron');
const appPath = process.argv[2] ?? '.';
const extraArgs = process.argv.slice(3);

const child = spawn(electronBinary, [appPath, ...extraArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('[ElectronLauncher] Failed to start Electron.', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
