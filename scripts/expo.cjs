// Runs the project's Expo CLI (`npm start`, `npm run android`, `npm run export:web`, …).
//
// On Windows, Metro fails with "Failed to get the SHA-1 for …" when the project path is spelled
// with a lowercase drive letter ("c:\…", as some terminals and editors open it) while the files
// on disk are reported as "C:\…". This runs the CLI from the project root with one consistent
// spelling, so it works from any terminal. On macOS and Linux it simply runs the CLI.

const { spawn } = require('node:child_process');
const path = require('node:path');

const sameDriveCase = (p) => (process.platform === 'win32' ? p.replace(/^[a-z]:/, (drive) => drive.toUpperCase()) : p);

const root = sameDriveCase(path.resolve(__dirname, '..'));
const cli = sameDriveCase(require.resolve('expo/bin/cli', { paths: [root] }));

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: process.env });
// Ctrl+C reaches the CLI directly (same terminal), so let it shut down cleanly instead of exiting
// first; pass on termination requests from elsewhere. Exit with the CLI's status.
process.on('SIGINT', () => undefined);
for (const signal of ['SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
