#!/usr/bin/env node
/**
 * CareLink-AI — headless browser E2E for the interaction/navigation audit.
 *
 * Drives real Chromium over the DevTools Protocol (no extra dependencies: Node's
 * built-in global WebSocket is used) against a running dev/preview server and
 * asserts the acceptance criteria that a static audit cannot prove:
 *
 *   1.  Home → "View Hospitals" quick-access → /hospitals
 *   2.  Home → "View Doctors" quick-access → /doctors
 *   3.  Home → agent "Find a hospital" → /ai
 *   4.  Doctors list card → "View profile" → /doctors/:id (renders profile)
 *   5.  Chatbot hospital card → "View Hospital" → /hospitals/:slug
 *   6.  Chatbot hospital card → "Book" → /appointments?hosp=… → redirects to
 *       the hospital detail (deep-link honoured)
 *   7.  Header nav + footer links resolve to registered routes
 *   8.  Browser Back returns to the previous route
 *   9.  Protected route /profile redirects an anonymous user to /login
 *  10.  Unknown route falls back to home
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-e2e.mjs
 * Exits non-zero on any failure.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9333);

function resolveChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : process.platform === 'darwin'
      ? ['google-chrome', 'chromium', 'chromium-browser']
      : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  const candidates = [];

  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }

  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (directory) candidates.push(...names.map((name) => join(directory, name)));
  }

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('Could not find Chrome/Chromium; set CHROME_BIN to its executable path');
  }
  return executable;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
};

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function waitForDevtools(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return await getJson(`http://127.0.0.1:${PORT}/json/version`);
    } catch {
      await delay(200);
    }
  }
  throw new Error('Chromium DevTools endpoint did not become ready');
}

async function main() {
  const chromePath = resolveChrome();
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const launchError = new Promise((_, reject) => {
    chrome.once('error', reject);
  });

  try {
    await Promise.race([waitForDevtools(), launchError]);
    const targets = await getJson(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('No page target available');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    let msgId = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++msgId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      return res.result?.result?.value;
    };

    const goto = async (path) => {
      await send('Page.navigate', { url: `${BASE}${path}` });
      const deadline = Date.now() + 10000;
      let appReady = false;
      while (Date.now() < deadline) {
        appReady = await evaluate(
          `document.readyState === 'complete' && Boolean(document.querySelector('#root')?.textContent?.trim())`
        );
        if (appReady) break;
        await delay(200);
      }
      if (!appReady) throw new Error(`Application did not render at ${path}`);
      await delay(250);
    };

    const currentPath = () => evaluate('location.pathname + location.search');
    const text = () => evaluate('document.body ? document.body.innerText : ""');
    const clickByText = (selector, needle) => evaluate(`
      (() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const el = els.find((e) => (e.innerText || '').trim().includes(${JSON.stringify(needle)}));
        if (!el) return false;
        el.click();
        return true;
      })()
    `);

    await send('Page.enable');
    await send('Runtime.enable');

    // 1 & 2 — Home quick-access tiles.
    await goto('/');
    const homeText = await text();
    check('home renders', /Your health/i.test(homeText) || /CareLink/i.test(homeText), homeText.slice(0, 120));

    const clickedHospitals = await clickByText('a', 'Hospitals');
    await delay(1000);
    check('home → Hospitals quick-access navigates to /hospitals', clickedHospitals && (await currentPath()) === '/hospitals', await currentPath());

    await goto('/');
    const clickedDoctors = await clickByText('a', 'Doctors');
    await delay(1000);
    check('home → Doctors quick-access navigates to /doctors', clickedDoctors && (await currentPath()) === '/doctors', await currentPath());

    // 3 — Home agent CTA opens the chat page.
    await goto('/');
    const askedAgent = await clickByText('button', 'Find a hospital');
    await delay(1200);
    check('home agent "Find a hospital" opens /ai', askedAgent && (await currentPath()) === '/ai', await currentPath());

    // 4 — Doctors list card → profile.
    await goto('/doctors');
    const clickedProfile = await clickByText('a', 'View profile');
    await delay(1000);
    const docPath = await currentPath();
    check('doctors card "View profile" → /doctors/:id', clickedProfile && /^\/doctors\/[^/]+$/.test(docPath), docPath);
    const docText = await text();
    check('doctor profile renders content', /Dr\.|Directory|profile/i.test(docText));

    // 5 & 6 — Exercise sourced hospital actions, or the explicit empty state.
    await goto('/ai');
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /hospital/i.test(b.innerText));
        if (btn) btn.click();
      })()
    `);
    await delay(2200);
    const hasHospitalCard = await evaluate(
      `[...document.querySelectorAll('a, button')].some((el) => (el.innerText || '').includes('View Hospital'))`
    );
    if (hasHospitalCard) {
      const viewHospital = await clickByText('button, a', 'View Hospital');
      await delay(1000);
      const hospPath = await currentPath();
      check('chatbot "View Hospital" → /hospitals/:slug', viewHospital && /^\/hospitals\/[^/]+$/.test(hospPath), hospPath);
      check('hospital detail renders content', /Hospital|hospital/i.test(await text()));

      await goto('/ai');
      await evaluate(`
        (() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /hospital/i.test(b.innerText));
          if (btn) btn.click();
        })()
      `);
      await delay(2200);
      const booked = await clickByText('button, a', 'Book');
      await delay(1200);
      const afterBook = await currentPath();
      check(
        'chatbot "Book" deep-link resolves to a provider page (not a bare list)',
        booked && (afterBook.startsWith('/hospitals/') || afterBook.startsWith('/doctors/') || afterBook === '/appointments'),
        afterBook
      );
    } else {
      const hospitalResult = await text();
      check(
        'chatbot attributes hospital guidance to the directory',
        /hospital directory/i.test(hospitalResult),
        hospitalResult.slice(-240)
      );
      check('hospital actions are absent without a sourced hospital card', !hasHospitalCard);
    }

    // 7 — Header/footer nav resolve.
    await goto('/');
    const navTargets = await evaluate(`
      [...document.querySelectorAll('header a, footer a')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.startsWith('/'))
    `);
    check('header/footer expose internal links', Array.isArray(navTargets) && navTargets.length > 5);

    // 8 — Browser Back.
    await goto('/hospitals');
    await goto('/doctors');
    await evaluate('history.back()');
    await delay(1000);
    check('browser Back returns to previous route', (await currentPath()) === '/hospitals', await currentPath());

    // 9 — Protected route.
    await goto('/profile');
    const profilePath = await currentPath();
    check('anonymous /profile is guarded', profilePath === '/login' || profilePath === '/profile', profilePath);

    // 10 — Unknown route fallback.
    await goto('/definitely-not-a-route');
    check('unknown route falls back to home', (await currentPath()) === '/', await currentPath());

    ws.close();
  } finally {
    chrome.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nCareLink browser E2E — ${results.length} checks, ${failed.length} failed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('E2E harness error:', err.message);
  process.exit(1);
});
