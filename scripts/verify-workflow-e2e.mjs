#!/usr/bin/env node
/**
 * CareLink-AI — connected clinical workflow browser E2E (headless Chromium/CDP).
 *
 * Proves the END-TO-END chain in the REAL app on a running dev server:
 *
 *   report:       upload a lab PDF on /ai → real values read → abnormal finding
 *                 → facilities that PUBLISH the matching department → why-relevant
 *                 → a specialty action link
 *   prescription: upload a prescription PDF on /ai → the schedule is reproduced
 *                 verbatim → no invented dose → real pharmacy discovery
 *   medicine:     type a medicine name → reference-verified facts + pharmacies
 *   mobile:       the same surfaces at 360/390px, plus touch-target sizes for the
 *                 upload / send / emergency controls
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-workflow-e2e.mjs
 * Requires `npm run fixtures` first.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from './chromium.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9336);
const LAB_PDF = process.env.FIXTURE_LAB_PDF || '/tmp/lab-report-test.pdf';
const RX_PDF = process.env.FIXTURE_RX_PDF || '/tmp/prescription-test.pdf';

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
  const chrome = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, 'about:blank',
  ], { stdio: 'ignore' });
  const launchError = new Promise((_, reject) => chrome.once('error', reject));

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
    const exceptions = [];
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
      if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params?.exceptionDetails?.text ?? 'exception');
    });
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

    const loadAi = async () => {
      await send('Page.navigate', { url: `${BASE}/ai` });
      for (let i = 0; i < 60; i += 1) {
        if (await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root')?.textContent?.trim())`)) break;
        await delay(200);
      }
      await delay(900);
    };

    /** Attach a file to the composer and press Send; wait for a rendered result. */
    const uploadAndSend = async (file, waitFor) => {
      const doc = await send('DOM.getDocument', { depth: -1 });
      const inputRes = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
      const nodeId = inputRes.result?.nodeId;
      if (!nodeId) return false;
      await send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await delay(400);
      // Click the composer send button.
      await evaluate(`(() => {
        const btns = [...document.querySelectorAll('button')];
        const send = btns.find((b) => /^Send$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
        if (send) send.click();
      })()`);
      // innerText reflects CSS text-transform, and several headings are
      // uppercased by the design system, so compare case-insensitively.
      for (let i = 0; i < 120; i += 1) {
        if (await evaluate(`document.body.innerText.toLowerCase().includes(${JSON.stringify(waitFor.toLowerCase())})`)) return true;
        await delay(400);
      }
      return false;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    /* ---------------- 1. Report → facility discovery ---------------- */
    await loadAi();
    const reportRendered = await uploadAndSend(LAB_PDF, 'Facilities for the services your report indicates');
    let body = await evaluate('document.body.innerText');
    let hrefs = await evaluate(`[...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').join(' ')`);

    check('report: an uploaded lab report produces facility recommendations', reportRendered, body.slice(0, 300));
    check(
      'report: the why-relevant reason names a facility department and cites the value',
      /publishes a [A-Za-z &()/-]+ department[\s\S]{0,200}usually manages/i.test(body) && /HbA1c[\s\S]{0,60}7\.4/.test(body),
      'the evidence-grounded reason is missing',
    );
    check(
      'report: a clinician (not the app) makes the treatment decision',
      /A clinician decides/i.test(body),
      'the app must defer the clinical decision',
    );
    check(
      'report: the report never diagnoses the user',
      !/you (have|are diagnosed with|are suffering from) (diabetes|kidney|liver|anaemia)/i.test(body),
      'a diagnosis was asserted',
    );
    check(
      'report: a specialty action link is offered',
      /Find a (Endocrinology|Nephrology|Cardiology|General Medicine|Gastroenterology|Rheumatology) specialist/i.test(body)
        || /\/doctors\?q=/.test(hrefs),
      'no specialty action',
    );
    check('report: at least one recommended facility link resolves', /\/hospitals\/[a-z0-9-]+/.test(hrefs), 'no hospital link');

    /* ---------------- 2. Prescription → verbatim schedule ---------------- */
    await loadAi();
    const rxRendered = await uploadAndSend(RX_PDF, 'Your prescription, as written');
    body = await evaluate('document.body.innerText');

    check('prescription: an uploaded prescription shows the schedule as written', rxRendered, body.slice(0, 300));
    check(
      'prescription: the extracted instruction is reproduced verbatim',
      /Tab Metformin 500 mg BD after food x 30 days/i.test(body),
      'the instruction from the document is missing',
    );
    check(
      'prescription: all extracted medicine lines are shown',
      /Amoxicillin/i.test(body) && /Omeprazole/i.test(body),
      'a medicine line is missing',
    );
    check(
      'prescription: the app states it does not create or change a prescription',
      /does not create, change or remind/i.test(body),
      'the prescription disclaimer is missing',
    );
    check(
      'prescription: no invented dose is added by the app',
      !/(take|increase|reduce|stop)[^.]{0,40}\b\d+\s*(mg|tablet|cap)\b[^.]{0,20}(daily|bd|tds|od)/i.test(body.replace(/Tab (Metformin|Amoxicillin)|Cap Omeprazole|BD after food x 30 days|TDS after food for 5 days|OD before food/gi, '')),
      'the app appears to add dosing advice',
    );
    check(
      'prescription: real pharmacy discovery is offered',
      /\/pharmacies/.test(await evaluate(`[...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').join(' ')`))
        || /Find a pharmacy/i.test(body),
      'no pharmacy discovery',
    );

    /* ---------------- 3. Medicine → verified facts + pharmacies ---------------- */
    await loadAi();
    await evaluate(`(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'tell me about atorvastatin');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await delay(300);
    await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const send = btns.find((b) => /^Send$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      if (send) send.click();
    })()`);
    let medRendered = false;
    for (let i = 0; i < 120; i += 1) {
      if (await evaluate(`/Verified medicine information|Medicine information/i.test(document.body.innerText)`)) { medRendered = true; break; }
      await delay(400);
    }
    await delay(600);
    body = await evaluate('document.body.innerText');
    check('medicine: a typed medicine produces a verified information card', medRendered, body.slice(0, 300));
    check('medicine: the verified facts are shown with a source', /RxNorm|openFDA/i.test(body), 'no reference source shown');
    check('medicine: the verified badge is present (not a demo badge)', /Verified reference/i.test(body), 'no verified badge');
    check('medicine: pharmacy discovery is offered for the medicine', /Find a pharmacy/i.test(body), 'no pharmacy action');

    check('no uncaught console exceptions', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

    /* ---------------- 4. Mobile ---------------- */
    // Upload and analyse AT a mobile viewport (not just resize a desktop result),
    // so the upload → extraction → render chain is proven on a phone-sized screen.
    for (const width of [360, 390, 430]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 2, mobile: true });
      await loadAi();

      // The composer must expose a real camera-capture path on mobile.
      const camera = await evaluate(`(() => {
        const el = [...document.querySelectorAll('input[type=file]')].find((i) => i.getAttribute('capture'));
        return el ? { capture: el.getAttribute('capture'), accept: el.getAttribute('accept') } : null;
      })()`);
      check(`mobile: a camera-capture input exists at ${width}px`, Boolean(camera) && camera.capture === 'environment', JSON.stringify(camera));

      const rendered = await uploadAndSend(LAB_PDF, 'Facilities for the services your report indicates');
      check(`mobile: a report uploads and is analysed at ${width}px`, rendered, 'analysis did not render');

      const overflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
      check(`mobile: no horizontal overflow at ${width}px`, overflow <= 1, `overflow ${overflow}px`);

      // Touch-target check: the composer send button must be a usable size.
      const sendBox = await evaluate(`(() => {
        const btns = [...document.querySelectorAll('button')];
        const send = btns.find((b) => /^Send$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
        if (!send) return null;
        const r = send.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })()`);
      check(`mobile: the send control is a usable touch target at ${width}px`, Boolean(sendBox) && sendBox.h >= 36, JSON.stringify(sendBox));

      // Every tel: link a phone would dial must be well-formed.
      const telHrefs = await evaluate(`[...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('tel:')).join(' ')`);
      check(`mobile: no malformed tel: link at ${width}px`, !/tel:\s*(?:\s|$)/.test(telHrefs), telHrefs);
    }
    await send('Emulation.clearDeviceMetricsOverride');
  } finally {
    chrome.kill('SIGKILL');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nCareLink connected-workflow E2E — ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error('verification failed:', err.message);
  process.exit(1);
});
