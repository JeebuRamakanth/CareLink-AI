/**
 * Register the module hooks that let the app's TypeScript sources run under
 * node:test without a bundler, and provide the browser globals those sources
 * expect (Vite's `import.meta.env`, and `window.setTimeout` used by the mock
 * adapters). Test-only: never imported by the application bundle.
 *
 * Usage: node --experimental-strip-types --import ./scripts/test-register.mjs --test ...
 */
import { register } from 'node:module';

// The mock adapters use `window.setTimeout`; the sources are browser-first.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
// Vite injects `import.meta.env`; the load hook substitutes this global for it.
if (typeof globalThis.__VITE_ENV__ === 'undefined') globalThis.__VITE_ENV__ = {};

register('./test-resolve-hooks.mjs', import.meta.url);
