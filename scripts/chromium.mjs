import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function resolveChrome() {
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
