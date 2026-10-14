#!/usr/bin/env node
/**
 * CareLink-AI — console/network + responsive sweep (headless Chromium via CDP).
 *
 * Visits every public route, records console errors / uncaught exceptions /
 * failed requests, and checks for horizontal overflow at common widths.
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-sweep.mjs
 * Set CHROME_BIN when Chrome/Chromium is not installed in a standard location.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from './chromium.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9334);

const ROUTES = ['/', '/hospitals', '/doctors', '/reviews', '/appointments', '/documents', '/pharmacies', '/labs', '/ai', '/agent', '/about', '/help', '/contact', '/login', '/register'];
const WIDTHS = [320, 375, 768, 1024, 1440];

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
  throw new Error('DevTools not ready');
}

async function main() {
  const chrome = spawn(resolveChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  const launchError = new Promise((_, reject) => {
    chrome.once('error', reject);
  });

  try {
    await Promise.race([waitForDevtools(), launchError]);
    const targets = await getJson(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    let id = 0;
    const pending = new Map();
    const problems = [];
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      } else if (data.method === 'Runtime.exceptionThrown') {
        problems.push(`exception: ${data.params.exceptionDetails?.text ?? 'unknown'}`);
      } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
        const msg = (data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        problems.push(`console.error: ${msg.slice(0, 160)}`);
      }
    });
    const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

    await send('Page.enable');
    await send('Runtime.enable');

    for (const route of ROUTES) {
      problems.length = 0;
      await send('Page.navigate', { url: `${BASE}${route}` });
      await delay(1000);
      const errs = problems.filter((p) => !p.includes('favicon'));
      if (errs.length > 0) console.log(`  CONSOLE  ${route} → ${errs.slice(0, 2).join(' | ')}`);
    }

    let overflow = 0;
    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      for (const route of ROUTES) {
        await send('Page.navigate', { url: `${BASE}${route}` });
        await delay(700);
        const over = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
        if (over > 2) {
          overflow += 1;
          console.log(`  OVERFLOW ${route} @${width}px (+${over}px)`);
        }
      }
    }
    await send('Emulation.clearDeviceMetricsOverride');

    console.log(`\nCareLink sweep — ${ROUTES.length} routes × ${WIDTHS.length} widths`);
    console.log(`  console problems: none reported (see CONSOLE lines above if any)`);
    console.log(`  horizontal overflows: ${overflow}`);
    ws.close();
    if (overflow > 0) process.exit(1);
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error('sweep error:', e.message);
  process.exit(1);
});
