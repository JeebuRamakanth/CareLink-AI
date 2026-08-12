export function isBrowser() {
  return typeof window !== 'undefined';
}

export function createId(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export * from './errors';
export * from './http';
export * from './normalize';
export * from './apiMode';
export * from './validation';
export * from './location';
export * from './security';
