export function isBrowser() {
  return typeof window !== 'undefined';
}

export function createId(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
