// Browser, static server and page helpers for the end-to-end tests.

import { existsSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Browser, ElementHandle, LaunchOptions, Page } from 'puppeteer-core';

// ---------------------------------------------------------------- browser

function knownBrowserPaths(): string[] {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((p): p is string => !!p);
    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Chromium', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    const apps = ['/Applications', path.join(env.HOME ?? '', 'Applications')];
    return apps.flatMap((dir) => [
      path.join(dir, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      path.join(dir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(dir, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
    ]);
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/opt/google/chrome/chrome',
  ];
}

/** Chrome, Chromium or Edge installed on this computer (CHROME_PATH wins). */
export function findBrowser(): string {
  const configured = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`CHROME_PATH points to ${configured}, which doesn't exist.`);
    return configured;
  }
  const found = knownBrowserPaths().find((p) => existsSync(p));
  if (!found) {
    throw new Error('No Chrome, Chromium or Edge found. Install Google Chrome, or set CHROME_PATH to a Chrome/Chromium/Edge executable.');
  }
  return found;
}

export function launchOptions(executablePath: string): LaunchOptions {
  return {
    executablePath,
    headless: true,
    // --no-sandbox: CI containers run as root, where Chrome's sandbox can't start.
    args: ['--no-sandbox', '--lang=en-IN', '--window-size=390,844'],
  };
}

// ---------------------------------------------------------------- static site

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

/** Serves the web export, with index.html for every unknown path (client-side routes). */
export function serveDirectory(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

// ---------------------------------------------------------------- page helpers

export type DialogAction = 'accept' | 'dismiss';

export interface Control {
  role: string;
  name: string;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a page with helpers that find elements the way a person would (visible, on top, scrolled
 * into view), record every dialog, and audit each screen's buttons.
 */
export class Harness {
  readonly problems: string[] = [];
  readonly dialogs: string[] = [];
  readonly clicked = new Set<string>();
  readonly seen = new Map<string, Set<string>>();
  step = 'init';
  allowNetworkErrors = false;
  private nextDialogActions: DialogAction[] = [];
  private shotIndex = 0;
  private clockScript: string | null = null;

  readonly browser: Browser;
  readonly page: Page;
  readonly shotsDir: string;

  constructor(browser: Browser, page: Page, shotsDir: string) {
    this.browser = browser;
    this.page = page;
    this.shotsDir = shotsDir;
    mkdirSync(shotsDir, { recursive: true });
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warn') return;
      const text = msg.text();
      if (this.allowNetworkErrors && /Failed to load resource|ERR_CONNECTION|ERR_EMPTY_RESPONSE|Failed to fetch|refresh failed/.test(text)) return;
      this.problems.push(`[${this.step}] console.${type}: ${text}`);
    });
    page.on('pageerror', (error) => this.problems.push(`[${this.step}] page error: ${(error as Error).message}`));
    page.on('dialog', async (dialog) => {
      const action = this.nextDialogActions.shift() ?? 'accept';
      this.dialogs.push(`[${this.step}] ${dialog.type()}: ${dialog.message().replace(/\n+/g, ' | ')}`);
      if (action === 'accept') await dialog.accept();
      else await dialog.dismiss();
    });
  }

  log(message: string) {
    console.log(`  [${this.step}] ${message}`);
  }

  /** The next browser dialog (alert/confirm) gets this answer instead of OK. */
  answerNextDialog(action: DialogAction) {
    this.nextDialogActions.push(action);
  }

  /** The most recent dialog's text, if one appeared since `since` dialogs were recorded. */
  lastDialog(since: number): string | null {
    return this.dialogs.length > since ? this.dialogs[this.dialogs.length - 1] : null;
  }

  async expectDialog(action: () => Promise<void>, pattern: RegExp) {
    const before = this.dialogs.length;
    await action();
    for (let i = 0; i < 30 && this.dialogs.length === before; i++) await pause(100);
    const shown = this.dialogs.slice(before).join(' || ');
    if (!pattern.test(shown)) throw new Error(`Expected a dialog matching ${pattern}, got: ${shown || 'none'}`);
  }

  async shot(name: string) {
    this.shotIndex++;
    await this.page.screenshot({ path: path.join(this.shotsDir, `${String(this.shotIndex).padStart(2, '0')}-${name}.png`) });
  }

  /** Waits for an element matching the finder that a person could see and tap. */
  private async find(kind: 'text' | 'exact' | 'label' | 'labelPrefix' | 'css', value: string, mustBeHittable: boolean, timeout = 8000) {
    const handle = await this.page.waitForFunction(
      (k, v, needHit) => {
        const visible = (el: Element) => (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[aria-hidden="true"]'));
        let candidates: Element[];
        if (k === 'css') candidates = [...document.querySelectorAll(v)];
        else if (k === 'label') candidates = [...document.querySelectorAll('[aria-label]')].filter((el) => el.getAttribute('aria-label') === v);
        else if (k === 'labelPrefix') candidates = [...document.querySelectorAll('[aria-label]')].filter((el) => el.getAttribute('aria-label')!.startsWith(v));
        else {
          const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
          const all = [...document.querySelectorAll('body *')].filter((el) =>
            k === 'exact' ? norm((el as HTMLElement).innerText ?? '') === v : ((el as HTMLElement).innerText ?? '').includes(v),
          );
          // The innermost elements holding the text.
          candidates = all.filter((el) => ![...el.children].some((c) => (k === 'exact' ? norm((c as HTMLElement).innerText ?? '') === v : ((c as HTMLElement).innerText ?? '').includes(v))));
        }
        for (const el of candidates) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx < 0 || cx >= window.innerWidth || cy < 0 || cy >= window.innerHeight) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            continue;
          }
          if (!needHit) return el;
          const hit = document.elementFromPoint(cx, cy);
          if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return el;
          el.scrollIntoView({ block: 'center', inline: 'center' });
        }
        return null;
      },
      { polling: 100, timeout },
      kind,
      value,
      mustBeHittable,
    );
    return handle.asElement() as ElementHandle<Element>;
  }

  private async tap(kind: 'text' | 'exact' | 'label' | 'labelPrefix' | 'css', value: string) {
    let el: ElementHandle<Element>;
    try {
      el = await this.find(kind, value, true);
    } catch {
      throw new Error(`Couldn't find a tappable ${kind === 'css' ? 'element' : kind} "${value}"`);
    }
    // Record the control's name (for the coverage report).
    const name = await el.evaluate((node) => {
      const control = node.closest('[role="button"],[role="link"],[role="tab"],[role="radio"],[role="checkbox"],a,button,[tabindex="0"]');
      const target = control ?? node;
      return (target.getAttribute('aria-label') || (target as HTMLElement).innerText || '')
        .replace(/[-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    });
    this.clicked.add(name);
    await el.click();
    await pause(250);
  }

  tapText = (text: string) => this.tap('text', text);
  tapExact = (text: string) => this.tap('exact', text);
  tapLabel = (label: string) => this.tap('label', label);
  tapLabelPrefix = (prefix: string) => this.tap('labelPrefix', prefix);

  async waitLabel(label: string) {
    return this.find('label', label, false);
  }

  async expectText(text: string, timeout = 8000) {
    try {
      await this.find('text', text, false, timeout);
    } catch {
      throw new Error(`Expected to see "${text}"`);
    }
  }

  async expectNoText(text: string) {
    const present = await this.page.evaluate(
      (t) =>
        [...document.querySelectorAll('body *')].some(
          (el) => (el as HTMLElement).innerText?.includes(t) && (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[aria-hidden="true"]')),
        ),
      text,
    );
    if (present) throw new Error(`Didn't expect to see "${text}"`);
  }

  async expectLabel(label: string) {
    try {
      await this.find('label', label, false);
    } catch {
      throw new Error(`Expected an element labelled "${label}"`);
    }
  }

  async expectNoLabel(label: string) {
    const present = await this.page.evaluate(
      (l) => [...document.querySelectorAll('[aria-label]')].some((el) => el.getAttribute('aria-label') === l && (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[aria-hidden="true"]'))),
      label,
    );
    if (present) throw new Error(`Didn't expect an element labelled "${label}"`);
  }

  /** Taps a bottom-tab-bar item. */
  async tab(label: string) {
    const handle = await this.page.waitForFunction(
      (l) =>
        [...document.querySelectorAll('a,[role="tab"],[role="button"]')].find(
          (el) => (el as HTMLElement).innerText.trim().split('\n').pop()!.trim() === l && el.getBoundingClientRect().top > window.innerHeight - 120,
        ),
      { timeout: 8000 },
      label,
    );
    this.clicked.add(`tab:${label}`);
    await (handle.asElement() as ElementHandle<Element>).click();
    await pause(500);
  }

  async type(label: string, text: string, options: { replace?: boolean } = {}) {
    const input = await this.find('label', label, true);
    this.clicked.add(label);
    await input.click();
    if (options.replace) {
      await input.evaluate((el) => (el as HTMLInputElement).select());
      await this.page.keyboard.press('Backspace');
    }
    await this.page.keyboard.type(text);
    await pause(250);
  }

  /** Every interactive control on screen right now (including ones scrolled out of view). */
  async controls(): Promise<Control[]> {
    return this.page.evaluate(() => {
      const ROLES = new Set(['button', 'link', 'tab', 'radio', 'checkbox', 'switch', 'menuitem']);
      const out: { role: string; name: string }[] = [];
      for (const el of document.querySelectorAll('[role],a[href],button,input,textarea,[tabindex="0"]')) {
        let role = el.getAttribute('role') ?? '';
        if (!role) role = el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? 'textbox' : 'focusable';
        if (!ROLES.has(role) && role !== 'textbox' && role !== 'focusable') continue;
        if (!(el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[aria-hidden="true"]'))) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        // Icon fonts render as private-use characters; they aren't part of the name.
        const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || '')
          .replace(/[-]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        out.push({ role, name });
      }
      return out;
    });
  }

  /**
   * Checks the screen as it is now: no control appears twice (same role and name), every control
   * has a name, and nothing is wider than the screen.
   */
  async audit(screen: string) {
    const controls = await this.controls();
    const counts = new Map<string, number>();
    const seen = this.seen.get(screen) ?? new Set<string>();
    for (const c of controls) {
      if (c.role === 'focusable' && !c.name) continue;
      if (!c.name) this.problems.push(`[${screen}] a ${c.role} has no label`);
      const key = `${c.role === 'link' ? 'button' : c.role}|${c.name}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      seen.add(c.name);
    }
    this.seen.set(screen, seen);
    for (const [key, n] of counts) {
      if (n > 1 && !key.endsWith('|')) this.problems.push(`[${screen}] duplicate control ×${n}: ${key.replace('|', ' "')}"`);
    }
    const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) this.problems.push(`[${screen}] the page is ${overflow}px wider than the screen`);
  }

  /** Moves the browser's clock forward (applies from the next page load). */
  async shiftClock(minutes: number) {
    if (this.clockScript) await this.page.removeScriptToEvaluateOnNewDocument(this.clockScript);
    const { identifier } = await this.page.evaluateOnNewDocument((shiftMs: number) => {
      const RealDate = Date;
      class ShiftedDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) super(RealDate.now() + shiftMs);
          else super(...(args as [string | number | Date]));
        }
        static now() {
          return RealDate.now() + shiftMs;
        }
      }
      (globalThis as { Date: DateConstructor }).Date = ShiftedDate as DateConstructor;
    }, minutes * 60_000);
    this.clockScript = identifier;
  }

  async reload() {
    await this.page.reload({ waitUntil: 'networkidle0' });
    await pause(400);
  }

  pause = pause;
}
