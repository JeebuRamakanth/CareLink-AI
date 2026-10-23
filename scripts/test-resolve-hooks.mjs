/**
 * Node module hooks for running the app's TypeScript sources under node:test
 * without a bundler:
 *
 *   resolve — resolve an extensionless relative import to `.ts` / `/index.ts`
 *             (Vite resolves these in the app build; Node does not).
 *   load    — replace the Vite-only `import.meta.env` with a plain global so
 *             config modules can be imported outside Vite.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = fileURLToPath(new URL(specifier, pathToFileURL(parent)));
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.endsWith('.ts') && result.source) {
    const source = typeof result.source === 'string' ? result.source : readFileSync(fileURLToPath(url), 'utf8');
    if (source.includes('import.meta.env')) {
      return { ...result, source: source.replaceAll('import.meta.env', '(globalThis.__VITE_ENV__ ?? {})') };
    }
  }
  return result;
}
