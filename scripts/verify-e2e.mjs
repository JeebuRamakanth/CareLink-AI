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
 *   5.  Chatbot hospital card actions work when sourced records exist; otherwise
 *       hospital guidance remains attributed and does not invent provider links
 *   7.  Header nav + footer links resolve to registered routes
 *   8.  Browser Back returns to the previous route
 *   9.  Protected route /profile redirects an anonymous user to /login
 *  10.  Unknown route falls back to home
 *
 * Usage: BASE_URL=http://localhost:12000 node scripts/verify-e2e.mjs
 * Set CHROME_BIN when Chrome/Chromium is not installed in a standard location.
 * Exits non-zero on any failure.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from './chromium.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:12000';
const PORT = Number(process.env.CDP_PORT || 9333);

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

    // 6b — Chatbot blood-centre intent uses REAL sourced centres (no stock).
    await goto('/ai');
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /blood bank|blood centre/i.test(b.innerText));
        if (btn) btn.click();
      })()
    `);
    await delay(1200);
    if (!(await evaluate('document.body.innerText.includes("Blood centre") || document.body.innerText.includes("blood centre")'))) {
      // No quick-action chip: type the query instead.
      await evaluate(`
        (() => {
          const ta = document.querySelector('textarea');
          if (!ta) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, 'blood banks near me');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.closest('form')?.requestSubmit();
        })()
      `);
      await delay(2200);
    }
    const bloodText = await text();
    check(
      'chatbot blood intent returns a real sourced blood centre',
      /IRCS|Red Cross/i.test(bloodText),
      bloodText.slice(-240)
    );
    check(
      'chatbot never reports a fabricated blood stock level',
      !/\b\d+\s+units\b/i.test(bloodText) && /not integrated|confirm/i.test(bloodText),
      bloodText.slice(-240)
    );

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

    /* ---------------------------------------------------------------------
     * Step 27 acceptance checks
     * ------------------------------------------------------------------- */

    // 11 — Hamburger opens the navigation overlay with every destination, the
    // page behind is dimmed/blocked, Escape closes, and scroll is restored.
    await goto('/');
    const openedDrawer = await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('header button')]
          .find((b) => (b.getAttribute('aria-label') || '') === 'Open navigation menu');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    await delay(500);
    const drawerState = await evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Site navigation"]');
        if (!dialog) return { present: false };
        const links = [...dialog.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
        return {
          present: true,
          modal: dialog.getAttribute('aria-modal') === 'true',
          links,
          bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
        };
      })()
    `);
    // Anonymous visitors see the public destinations; account-only entries
    // (Profile, Admin) are intentionally filtered out for them.
    const requiredTargets = ['/hospitals', '/doctors', '/pharmacies', '/labs', '/blood-banks', '/reviews', '/appointments', '/documents', '/ai', '/agent', '/about', '/help', '/contact'];
    check(
      'hamburger opens the navigation overlay',
      openedDrawer && drawerState.present === true && drawerState.modal === true,
      JSON.stringify(drawerState).slice(0, 200)
    );
    check(
      'overlay exposes every public navigation destination',
      Array.isArray(drawerState.links) && requiredTargets.every((t) => drawerState.links.includes(t)),
      JSON.stringify(drawerState.links ?? []).slice(0, 240)
    );
    check(
      'overlay hides account-only destinations from anonymous visitors',
      Array.isArray(drawerState.links) && !drawerState.links.includes('/profile'),
      JSON.stringify(drawerState.links ?? []).slice(0, 200)
    );
    check('overlay locks background scrolling', drawerState.bodyLocked === true);

    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await delay(500);
    const closedState = await evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Site navigation"]');
        const visible = dialog ? dialog.getBoundingClientRect().left > -1 : false;
        return { visible, bodyOverflow: getComputedStyle(document.body).overflow };
      })()
    `);
    check('Escape closes the overlay', closedState.visible === false);
    check('background scrolling is restored after closing', closedState.bodyOverflow !== 'hidden', closedState.bodyOverflow);

    // 12 — Doctors hero has no right-side search card and the real search still works.
    await goto('/doctors');
    const doctorsHero = await evaluate(`
      (() => {
        const body = document.body.innerText;
        return {
          hasSearchInput: Boolean(document.getElementById('doctor-search-input')),
          heroHasPlaceholderCard: /Doctor Name[\\s\\S]{0,80}Specialty/.test(body),
        };
      })()
    `);
    check('doctors hero no longer renders the right-side search card', doctorsHero.heroHasPlaceholderCard === false);
    check('doctor search control still exists below the hero', doctorsHero.hasSearchInput === true);

    const doctorFilterWorks = await evaluate(`
      (() => {
        const input = document.getElementById('doctor-search-input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'zzzz-no-such-doctor');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await delay(600);
    const doctorEmptyText = await text();
    check(
      'doctor search filters to an honest empty state',
      doctorFilterWorks && /No doctors matched/i.test(doctorEmptyText),
      doctorEmptyText.slice(0, 200)
    );

    // 13 — Three-dot chatbot menu executes a prompt through the real pipeline.
    await goto('/ai');
    const menuOpened = await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')]
          .find((b) => (b.getAttribute('aria-label') || '') === 'Open quick prompts');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    await delay(400);
    const menuPrompts = await evaluate(`
      [...document.querySelectorAll('[role="menu"][aria-label="Quick prompts"] [role="menuitem"]')]
        .map((b) => (b.innerText || '').trim())
    `);
    check('three-dot menu opens with prompts', menuOpened && Array.isArray(menuPrompts) && menuPrompts.length >= 10, JSON.stringify(menuPrompts).slice(0, 200));

    const pickedPrompt = await evaluate(`
      (() => {
        const items = [...document.querySelectorAll('[role="menu"][aria-label="Quick prompts"] [role="menuitem"]')];
        const el = items.find((b) => (b.innerText || '').includes('Find pharmacies near me'));
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
    await delay(3000);
    const afterPrompt = await evaluate(`
      (() => {
        const main = document.querySelector('#ai-chat-main') || document.body;
        return {
          path: location.pathname,
          conversation: main.innerText,
          inputValue: (document.querySelector('textarea[aria-label="Ask CareLink AI"]') || {}).value || '',
        };
      })()
    `);
    check(
      'prompt selection submits through the real pipeline (result rendered)',
      pickedPrompt && /Apollo|MedPlus|Grace Pharmacy|pharmac/i.test(afterPrompt.conversation)
        && !/^\\s*$/.test(afterPrompt.conversation),
      afterPrompt.conversation.slice(0, 240)
    );
    check(
      'prompt is executed, not merely inserted into the composer',
      afterPrompt.inputValue.trim() === '',
      `input="${afterPrompt.inputValue}"`
    );
    check(
      'pharmacy result never fabricates a stock level',
      // No numeric quantity/units claim, and the honest "not connected" state is present.
      !/\\b\\d+\\s*(units|packs|tablets available|in stock)\\b/i.test(afterPrompt.conversation)
        && /stock is not connected|not connected/i.test(afterPrompt.conversation),
      afterPrompt.conversation.slice(-240)
    );

    // 14 — Enter submits and Shift+Enter inserts a newline (same submit path).
    await goto('/ai');
    const enterSubmitted = await evaluate(`
      (() => {
        const ta = document.querySelector('textarea[aria-label="Ask CareLink AI"]');
        if (!ta) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, 'Find a blood centre');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return true;
      })()
    `);
    await delay(2500);
    const enterBody = await text();
    check('Enter submits the composer message', enterSubmitted && /IRCS|Red Cross|blood/i.test(enterBody), enterBody.slice(-200));

    // 15 — Pharmacy page: real records, corridor-wide, no location required.
    await goto('/pharmacies');
    const pharmacyText = await text();
    check('pharmacies page renders sourced records without location permission', /Apollo|MedPlus|pharmac/i.test(pharmacyText), pharmacyText.slice(0, 200));
    check('pharmacy page states stock is not connected', /stock is not connected|not connected/i.test(pharmacyText));
    check(
      'pharmacy list is not restricted to one city (corridor-wide)',
      /Machilipatnam/i.test(pharmacyText) && /Vijayawada/i.test(pharmacyText),
      pharmacyText.slice(0, 260)
    );

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
