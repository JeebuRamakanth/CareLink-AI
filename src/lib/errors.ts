/**
 * CareLink-AI integration error model (Step 9).
 *
 * Vendor-specific errors are normalized here so the UI never imports or catches
 * provider SDK error types. Errors carry a stable `code` the UI maps to a
 * graceful state (loading/unavailable/timeout/partial/retry/fallback-to-demo).
 *
 * SECURITY: errors never include API keys, tokens, request bodies, or raw
 * response payloads. They surface a safe `detail` only.
 */

export type IntegrationErrorCode =
  | 'missing-credentials'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'malformed-response'
  | 'missing-fields'
  | 'payload-too-large'
  | 'unavailable'
  | 'aborted'
  | 'unknown';

export type DataSource = 'real' | 'mock' | 'fallback';

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly provider: string;
  readonly source: DataSource;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(params: {
    code: IntegrationErrorCode;
    provider: string;
    message?: string;
    source?: DataSource;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message ?? safeMessage(params.code, params.provider));
    this.name = 'IntegrationError';
    this.code = params.code;
    this.provider = params.provider;
    this.source = params.source ?? 'real';
    this.retryable = params.retryable ?? isRetryable(params.code);
    this.cause = params.cause;
  }

  /** Safe, non-sensitive summary for UI/logging. Never echoes secrets. */
  toUserMessage(): string {
    switch (this.code) {
      case 'timeout':
        return 'The request took too long. Showing demo data so you can keep exploring.';
      case 'rate-limit':
        return 'This service is busy right now. Showing demo data so you can keep exploring.';
      case 'network':
      case 'unavailable':
        return 'This service is temporarily unavailable. Showing demo data so you can keep exploring.';
      case 'unauthorized':
      case 'forbidden':
        return 'This service is not configured for your account. Showing demo data instead.';
      case 'missing-credentials':
        return 'No credentials configured for this service — running in demo mode.';
      case 'aborted':
        return 'The request was cancelled.';
      default:
        return 'We could not reach this service right now. Showing demo data so you can keep exploring.';
    }
  }
}

function safeMessage(code: IntegrationErrorCode, provider: string): string {
  return `${provider}: ${code}`;
}

function isRetryable(code: IntegrationErrorCode): boolean {
  return code === 'timeout' || code === 'network' || code === 'rate-limit' || code === 'unavailable';
}

/** Normalize an arbitrary thrown value into an IntegrationError. */
export function toIntegrationError(err: unknown, provider: string, source: DataSource = 'real'): IntegrationError {
  if (err instanceof IntegrationError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new IntegrationError({ code: 'aborted', provider, source });
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return new IntegrationError({ code: 'timeout', provider, source, cause: err });
    }
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed')) {
      return new IntegrationError({ code: 'network', provider, source, cause: err });
    }
    if (msg.includes('unauthorized') || msg.includes('401')) {
      return new IntegrationError({ code: 'unauthorized', provider, source, cause: err });
    }
    if (msg.includes('forbidden') || msg.includes('403')) {
      return new IntegrationError({ code: 'forbidden', provider, source, cause: err });
    }
    if (msg.includes('rate') || msg.includes('429')) {
      return new IntegrationError({ code: 'rate-limit', provider, source, cause: err });
    }
  }
  return new IntegrationError({ code: 'unknown', provider, source, cause: err });
}

/** True for any value that represents an abort signal from the platform. */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof IntegrationError && err.code === 'aborted') return true;
  return false;
}
