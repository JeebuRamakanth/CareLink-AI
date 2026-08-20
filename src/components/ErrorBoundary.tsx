/**
 * CareLink-AI — global error boundary (Step 14 §22).
 *
 * Last-resort containment for unexpected render/runtime errors: instead of a
 * blank white screen the user gets a safe, branded recovery state with a
 * reload action. The raw error is logged only through `safeLog` (credentials
 * and long opaque tokens are redacted) and never rendered to the DOM.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { log } from '../lib/security';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('ui', 'unhandled render error', { message: error.message, stack: info.componentStack?.slice(0, 500) });
  }

  private handleReload = (): void => {
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-300">
            CareLink hit an unexpected error. Your data is safe — no information was lost.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-500 px-6 text-sm font-semibold text-white transition hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }
}
