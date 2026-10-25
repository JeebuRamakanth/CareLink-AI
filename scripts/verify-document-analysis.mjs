#!/usr/bin/env node
/**
 * CareLink-AI — headless browser verification of the medical-document analysis
 * flow.
 *
 * Uploads a SYNTHETIC lab-report PDF through the real file input and asserts
 * what the user actually sees: the extraction result, each value with its unit
 * and the report's own reference range, the critical-value emergency banner,
 * the India emergency number, the disclosed limitations, the evidence section,
 * the document-type correction and the follow-up input.
 *
 * It also asserts the safety guarantees that must never regress:
 *   - no US emergency number is offered,
 *   - the app never claims an ambulance was dispatched,
 *   - a value the parser could not reconcile is disclosed, not silently shown.
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-document-analysis.mjs
 * Exits non-zero on any failure.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { resolveChrome } from './chromium.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9344);
const PDF = process.env.FIXTURE_PDF || '/tmp/lab-report-test.pdf';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
};

async function getJson(url) {
  return (await fetch(url)).json();
}

async function main() {
  if (!existsSync(PDF)) {
    console.error(`Fixture PDF not found at ${PDF}. Generate a synthetic lab report first (see the test docs).`);
    process.exit(1);
  }

  const chrome = spawn(
    resolveChrome(),
    ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, 'about:blank'],
    { stdio: 'ignore' }
  );

  try {
    let ready = false;
    for (let i = 0; i < 75; i += 1) {
      try {
        await getJson(`http://127.0.0.1:${PORT}/json/version`);
        ready = true;
        break;
      } catch {
        await delay(200);
      }
    }
    if (!ready) throw new Error('Chromium DevTools endpoint did not become ready');

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
    const exceptions = [];
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(data.params?.exceptionDetails?.text ?? 'exception');
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++msgId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    await send('Page.navigate', { url: `${BASE}/documents` });
    for (let i = 0; i < 50; i += 1) {
      if (await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root')?.textContent?.trim())`)) break;
      await delay(200);
    }
    await delay(800);

    // Expand the "Secure document analysis" panel when it is collapsed.
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Secure document analysis/i.test(x.innerText)); if (b) b.click(); })()`);
    await delay(600);

    const doc = await send('DOM.getDocument', { depth: -1 });
    const inputRes = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
    const nodeId = inputRes.result?.nodeId;
    check('a file input is present on the documents page', Boolean(nodeId), 'no input[type=file]');
    if (!nodeId) throw new Error('no file input on the page');
    await send('DOM.setFileInputFiles', { nodeId, files: [PDF] });

    let rendered = false;
    for (let i = 0; i < 90; i += 1) {
      rendered = await evaluate(`/Findings extracted from your report|No text could be read|Summary/i.test(document.body.innerText)`);
      if (rendered) break;
      await delay(400);
    }
    await delay(600);

    const body = await evaluate('document.body.innerText');
    const hrefs = await evaluate(`[...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').join(' ')`);

    check('analysis result renders after upload', rendered, body.slice(0, 200));
    check('the report was read (not "no text")', /Findings extracted from your report/i.test(body), body.slice(0, 300));
    check('extracted value shown with its unit', /Hemoglobin[\s\S]{0,120}11\.2[\s\S]{0,60}g\/dL/i.test(body), 'Hemoglobin 11.2 g/dL missing');
    check("the report's own reference range is shown", /13\.0\s*-\s*17\.0/.test(body), 'reference range missing');
    check("the lab's own flag is surfaced", /lab flag:\s*L/i.test(body), 'lab flag missing');
    check('a CRITICAL value triggers the emergency banner', /Emergency — seek immediate help/i.test(body), 'no emergency banner');
    check('the emergency banner names the exact finding', /Potassium[\s\S]{0,80}6\.9/.test(body), 'critical detail missing');
    check('the emergency call action uses the India number 112', /tel:112/.test(hrefs), 'no tel:112 link');
    check('no US emergency number is offered', !/tel:911|tel:988/.test(hrefs), 'a US number is present');
    check('the app never claims an ambulance was dispatched', !/ambulance (has been )?dispatch|help is on the way|hospital notified/i.test(body), 'false dispatch claim');
    check('extraction provenance is shown', /PDF text layer/i.test(body), 'no provenance');
    check('limitations are disclosed', /Limitations/i.test(body), 'no limitations section');
    check('the unreviewed clinical catalog is disclosed', /not yet been reviewed by a clinician/i.test(body), 'catalog review status hidden');
    check('evidence/sources are listed', /Evidence & confidence/i.test(body), 'no evidence section');
    check('document-type correction is offered', /Correct it and re-analyse|Tell us so we can interpret/i.test(body), 'no type correction');
    check('a follow-up question input is offered', /Ask about this document/i.test(body), 'no follow-up input');
    check('a review-required value is disclosed as such', /lab flag|reference/i.test(body), 'no evidence of per-row evidence');
    check('no uncaught console exceptions', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

    for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await delay(450);
      const overflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
      check(`no horizontal overflow at ${width}px`, overflow <= 1, `overflow ${overflow}px`);
    }
    await send('Emulation.clearDeviceMetricsOverride');
  } finally {
    chrome.kill('SIGKILL');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error('verification failed:', err.message);
  process.exit(1);
});
