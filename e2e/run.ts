// End-to-end tests: builds the web app against a fake backend, then drives every screen, button
// and flow in a real browser (Chrome, Chromium or Edge, headless).
//
//   npm run e2e                     build + run
//   npm run e2e -- --skip-build     reuse the last build
//   npm run e2e -- --headed         watch it run
//
// The build and screenshots go to <temp>/vibevault-e2e (or E2E_OUTPUT_DIR). Set CHROME_PATH if your
// browser isn't found.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'puppeteer-core';
import { ANON_KEY, BACKEND_URL, createFakeBackend } from './fakeBackend.ts';
import { findBrowser, Harness, launchOptions, serveDirectory } from './harness.ts';
import { runFlows } from './flows.ts';

/** See scripts/expo.cjs: one spelling of the Windows drive letter for Metro. */
const normalizeDrive = (p: string) => (process.platform === 'win32' ? p.replace(/^[a-z]:/, (d) => d.toUpperCase()) : p);

const projectRoot = normalizeDrive(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const workDir = process.env.E2E_OUTPUT_DIR || path.join(os.tmpdir(), 'vibevault-e2e');
const exportDir = path.join(workDir, 'web');
const shotsDir = path.join(workDir, 'shots');
const args = new Set(process.argv.slice(2));

function buildWebApp() {
  console.log('Building the web app against the test backend…');
  rmSync(exportDir, { recursive: true, force: true });
  // scripts/expo.cjs runs the Expo CLI with a consistent project path on Windows.
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'expo.cjs'), 'export', '--platform', 'web', '--output-dir', exportDir], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      // Real environment variables take precedence over .env, so the build talks to the fake backend.
      EXPO_PUBLIC_SUPABASE_URL: BACKEND_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    },
  });
  if (result.status !== 0) throw new Error('The web build failed (see the output above).');
}

async function main() {
  if (!args.has('--skip-build') || !existsSync(path.join(exportDir, 'index.html'))) buildWebApp();
  rmSync(shotsDir, { recursive: true, force: true });

  const executablePath = findBrowser();
  console.log(`Browser: ${executablePath}`);
  const backend = createFakeBackend();
  await backend.start();
  const site = await serveDirectory(exportDir);
  const browser = await launch({ ...launchOptions(executablePath), headless: !args.has('--headed') });
  const page = await browser.newPage();
  const h = new Harness(browser, page, shotsDir);
  let failed = false;

  try {
    await browser.defaultBrowserContext().overridePermissions(site.url.replace(/\/$/, ''), ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    // Product images: a grey pixel for every image request to the fake image host.
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith('https://img.e2e/')) void request.respond({ status: 200, contentType: 'image/png', body: PNG });
      else void request.continue();
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    // A shopper in India: the app guesses country and currency from the device locale.
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-IN' });
    page.setDefaultTimeout(8000);
    // Links open in a new tab via window.open, and sharing uses the Web Share API: record both.
    await page.evaluateOnNewDocument(() => {
      window.__opened = [];
      window.open = ((url?: string | URL) => {
        window.__opened.push(String(url));
        return null;
      }) as typeof window.open;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: { title?: string; text?: string }) => {
          window.__shared = data;
        },
      });
    });

    await runFlows(h, site.url, backend);
  } catch (error) {
    failed = true;
    console.log(`\nFAILED at [${h.step}]: ${(error as Error).message}`);
    await h.shot(`FAILED-${h.step}`).catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
    await site.close();
    await backend.stop();
  }

  const coverage = untappedControls(h);
  if (coverage.length) console.log(`\nControls seen but not tapped (same kind of control tapped elsewhere is fine):\n  ${coverage.join('\n  ')}`);
  if (h.problems.length) {
    console.log(`\nPROBLEMS (${h.problems.length}):\n  ${h.problems.join('\n  ')}`);
    failed = true;
  }
  console.log(`\nDialogs shown: ${h.dialogs.length} · listing checks: ${backend.stats.liveChecks.length} · screenshots: ${shotsDir}`);
  console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED — every flow worked, no duplicate controls, no console errors');
  process.exitCode = failed ? 1 : 0;
}

/**
 * Kinds of control that appeared somewhere but were never tapped. Controls of the same kind (one
 * listing card, one filter chip, one country) count as one, so this lists what the flows miss.
 */
function untappedControls(h: Harness): string[] {
  const fold = (name: string) =>
    name
      .trim()
      .replace(/^(Category|Marketplace|Shop|Condition|Occasion|Style|Sort|Kind|Colour): .+/, '$1: <option>')
      .replace(/^Alert at .+/, 'Alert at <price>')
      .replace(/^Display name .+. Tap to edit.$/, 'Display name <name>. Tap to edit.')
      .replace(/^I own one like .+/, 'I own one like <item>')
      .replace(/^Remove .+ from your wardrobe$/, 'Remove <piece> from your wardrobe')
      .replace(/^Add .+ you own$/, 'Add <kind> you own')
      .replace(/^.+, (no longer available, )?(Buy now|Wait .+|Sale starts .+|No clear signal yet|Too close to call|Usually cheaper .+|No longer for sale)$/, '<wishlist row>')
      .replace(/^[\u{1F1E6}-\u{1F1FF}]{2} .+/u, '<country>')
      .replace(/^(Country|Currency for totals & budget) .+›$/, '$1 <setting> ›')
      .replace(/[₹$€£][\d,.]+/g, '<price>')
      .replace(/\d+/g, '#')
      .replace(/^(Save|Remove) .+ (to|from) wishlist$/, '$1 <item> $2 wishlist')
      .replace(/^(I'd wear it|Not for me): .+/, '$1: <item>')
      .replace(/^.+, <price> on .+$/, '<listing card>')
      .replace(/^(Top|Bottom|Dress \/ one-piece|Layer|Shoes|Bag|Accessory): .+/, '<outfit piece>')
      .replace(/^.+, #% match$/, '<top match>')
      .replace(/^.+, (common|rare|epic|legendary), (earned|locked)$/, '<badge>')
      .replace(/^.+, (Easy|Medium|Hard|Epic), .+$/, '<quest>')
      .replace(/^.+ alert$/, '<alert>')
      .replace(/^Delete alert for .+/, 'Delete alert for <item>');
  const tapped = new Set([...h.clicked].map(fold));
  const missed = new Map<string, string>();
  for (const [screen, names] of h.seen) {
    for (const name of names) {
      const kind = fold(name);
      if (!tapped.has(kind) && !tapped.has(`tab:${kind}`) && !missed.has(kind)) missed.set(kind, screen);
    }
  }
  return [...missed].map(([kind, screen]) => `${kind}   (on ${screen})`).sort();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
