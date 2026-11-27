// First-run setup for a new computer (Windows, macOS or Linux): `npm run setup`
//   • checks the Node.js version
//   • creates .env and supabase/functions/.env from their examples if they don't exist
//     (existing files are never changed)
//   • says what is still missing and what to run next
// Plain JavaScript on purpose, so it runs (and explains) even on an unsupported Node version.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
let problems = 0;

const ok = (msg) => console.log(`  ✓ ${msg}`);
const todo = (msg) => console.log(`  • ${msg}`);
const fail = (msg) => {
  problems++;
  console.log(`  ✗ ${msg}`);
};

console.log('VibeVault setup\n');

// ---- Node.js
const wanted = (pkg.engines && pkg.engines.node) || '>=22.12.0';
const [minMajor, minMinor] = wanted.replace(/[^\d.]/g, '').split('.').map(Number);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > minMajor || (major === minMajor && minor >= minMinor)) ok(`Node.js ${process.versions.node}`);
else fail(`Node.js ${process.versions.node} is too old — install Node.js ${minMajor} LTS (${wanted}), e.g. from https://nodejs.org or with nvm/fnm ("nvm use" reads .nvmrc).`);

// ---- dependencies
if (fs.existsSync(path.join(root, 'node_modules', 'expo', 'package.json'))) ok('Dependencies installed');
else fail('Dependencies missing — run "npm ci" first.');

// ---- env files (created from the examples, never overwritten)
function envFile(relative, example, describe) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    fs.copyFileSync(path.join(root, example), file);
    todo(`Created ${relative} from ${example} — ${describe}`);
  } else {
    ok(`${relative} exists (left unchanged)`);
  }
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith('#')) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const app = envFile('.env', '.env.example', 'fill in your Supabase URL and anon key.');
const url = app.EXPO_PUBLIC_SUPABASE_URL || '';
if (!/^https?:\/\//.test(url) || url.includes('your-project-ref') || !app.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  todo('.env: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (Supabase → Project Settings → API). Until then the app runs but shows "Live prices aren’t connected".');
} else {
  ok('.env: backend URL and anon key are set');
}

envFile('supabase/functions/.env', 'supabase/functions/.env.example', 'only needed to deploy the backend; see the comments in the file.');

console.log(`
Next:
  npm start            run the app (press a = Android, i = iOS, w = web)
  npm run check        typecheck, lint, unit and database tests
  npm run e2e          click through every screen in Chrome/Edge (set CHROME_PATH if it isn't found)
`);
process.exitCode = problems ? 1 : 0;
