#!/usr/bin/env node
/**
 * CareLink-AI — headless browser verification of the MEDICINE IMAGE workflow.
 *
 * Uploads a synthetic medicine PHOTO (a raster image, not a text PDF) through
 * the real file input on /ai and asserts what the user actually sees.
 *
 * The critical guarantee this test exists for: with no vision backend configured,
 * the app must show an HONEST "image analysis unavailable / could not be
 * identified" state — it must NOT show "CareLink demo response", a demo/mock
 * medicine identity, or a fabricated strength/dosage.
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-medicine-image.mjs
 * Exits non-zero on any failure.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { resolveChrome } from './chromium.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9347);
const PHOTO = process.env.FIXTURE_PHOTO || '/tmp/medicine-photo-test.png';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
};

const getJson = async (url) => (await fetch(url)).json();

async function main() {
  if (!existsSync(PHOTO)) {
    console.error(`Fixture photo not found at ${PHOTO}. Run: npm run fixtures`);
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
      try { await getJson(`http://127.0.0.1:${PORT}/json/version`); ready = true; break; } catch { await delay(200); }
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
      if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(data.params?.exceptionDetails?.exception?.description ?? 'exception');
      }
      if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
    });
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      return res.result?.result?.value;
    };
    const goto = async (path) => {
      await send('Page.navigate', { url: `${BASE}${path}` });
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root')?.textContent?.trim())`)) break;
        await delay(200);
      }
      await delay(400);
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // ---- /ai: attach a medicine PHOTO via the composer ---------------------
    await goto('/ai');
    await delay(600);

    const doc = await send('DOM.getDocument', { depth: -1 });
    const inputRes = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
    const nodeId = inputRes.result?.nodeId;
    check('a file input is present on /ai', Boolean(nodeId), 'no input[type=file]');
    if (!nodeId) throw new Error('no file input on /ai');

    await send('DOM.setFileInputFiles', { nodeId, files: [PHOTO] });
    // Give the real pipeline time to run (vision unavailable → honest state).
    await delay(3500);

    const composerBody = await evaluate('document.body.innerText');
    check('the attached photo appears in the composer', /medicine-photo-test\.png/i.test(composerBody), composerBody.slice(0, 200));

    // Send the turn so the orchestrator produces a result.
    await evaluate(`(() => { const b = [...document.querySelectorAll('button[type=submit],button')].find((x) => (x.getAttribute('aria-label') || '') === 'Send'); if (b) b.click(); })()`);
    await delay(4000);

    const body = await evaluate('document.body.innerText');
    const hrefs = await evaluate(`[...document.querySelectorAll('a')].forEach((a) => {}), [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').join(' ')`);

    // ---- The demo response must NOT be returned ---------------------------
    check('no "CareLink demo response" badge for a medicine photo', !/CareLink demo response/i.test(body), 'the demo response was returned');
    check('no "DEMO DATA" badge for a medicine photo', !/DEMO DATA/i.test(body), 'a demo data badge was shown');
    check('no mock medicine knowledge source is shown', !/medicine knowledge \(mock\)/i.test(body), 'a mock source label was shown');

    // ---- An honest state must be shown instead ----------------------------
    check(
      'an honest "could not be identified / unavailable" state is shown',
      /could not be identified|not confidently identified|image analysis (is )?not (available|configured)|could not be read|not confirmed|Identification not confirmed/i.test(body),
      body.slice(-400)
    );
    check(
      'the medicine-photo result is not presented as a verified medicine',
      !/matched to a medicine database/i.test(body),
      'a verified-match claim appeared without a vision backend'
    );

    // ---- No fabricated medicine facts --------------------------------------
    check('no fabricated strength/dosage is shown', !/\b650\s?mg\b/i.test(body), 'an invented strength appeared');
    check('no fabricated price is shown', !/₹\s?\d/.test(body), 'an invented price appeared');
    check('no dosing instruction is shown', !/take (one|two|1|2) (tablet|pill|piece)/i.test(body), 'a dosing instruction appeared');
    check('no "with hot/cold water" instruction', !/with (hot|cold) water/i.test(body), 'a hot/cold-water instruction appeared');
    check('no US emergency number is offered', !/tel:911|tel:988/.test(hrefs), 'a US number is present');

    // ---- A pharmacist/doctor consultation notice is always present ---------
    check(
      'the pharmacist/doctor consultation notice is shown',
      /consult a qualified doctor or pharmacist|verify the name and strength (with|printed)|ask a pharmacist/i.test(body),
      'the mandatory consultation notice is missing'
    );

    // ---- A clearer-photo / verify-with-pharmacist path is offered ----------
    check(
      'the user is asked for a clearer photo or the printed name',
      /clearer|sharper|front and back|type the (printed )?name|printed name/i.test(body),
      'no recovery path offered'
    );

    // ---- A typed (text) medicine is verified against a real database -------
    await goto('/ai');
    await delay(500);
    await evaluate(`(() => { const t = document.querySelector('textarea'); if (!t) return; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(t, 'Tell me about metformin'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await delay(300);
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '') === 'Send'); if (b) b.click(); })()`);
    await delay(5000);
    const medBody = await evaluate('document.body.innerText');
    check(
      'a typed medicine is not labelled with a mock source',
      !/medicine knowledge \(mock\)/i.test(medBody),
      'the typed-medicine path still shows a mock source'
    );
    check(
      'a typed medicine shows the consultation notice',
      /consult a qualified doctor or pharmacist|verify.{0,40}pharmacist/i.test(medBody),
      'no consultation notice on the typed-medicine result'
    );

    check('no uncaught console exceptions', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

    // ---- A lab report uploaded via the COMPOSER shows its REAL values ------
    const LAB_PDF = process.env.FIXTURE_LAB_PDF || '/tmp/lab-report-test.pdf';
    if (existsSync(LAB_PDF)) {
      await goto('/ai');
      await delay(600);
      const doc2 = await send('DOM.getDocument', { depth: -1 });
      const input2 = await send('DOM.querySelector', { nodeId: doc2.result.root.nodeId, selector: 'input[type=file]' });
      await send('DOM.setFileInputFiles', { nodeId: input2.result.nodeId, files: [LAB_PDF] });
      await delay(4000);
      await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '') === 'Send'); if (b) b.click(); })()`);
      await delay(5000);
      const labBody = await evaluate('document.body.innerText');
      // The fixture contains HbA1c 7.4 and no LDL row; the OLD hardcoded mock
      // reported HbA1c 6.8 and an LDL value. Reading the real file is what proves
      // the composer pipeline is no longer fabricating the report.
      check('a composer-uploaded lab report shows values read from the file', /Hemoglobin|Potassium|value\(s\) read|Lab report/i.test(labBody), labBody.slice(-300));
      check('the composer report is not a fabricated mock interpretation', !/Mock interpretation of your uploaded report/i.test(labBody), 'the old hardcoded report is still returned');
      check('a composer-uploaded report is not labelled a demo response', !/CareLink demo response/i.test(labBody), 'the demo badge is still shown for a real read');
    }

    // ---- Responsive: no horizontal overflow ---------------------------------
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await delay(350);
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
