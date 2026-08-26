/**
 * Native (Capacitor) bridge for the Android shell (Step 16).
 *
 * Everything here is a no-op in a plain browser, so web development and the
 * deployed website are completely unaffected. Currently handles:
 *
 * - Hardware back button: go back in web (React Router) history when there is
 *   somewhere to go; exit the app when already at the root of the history
 *   stack. When a listener is registered Capacitor disables its own default
 *   back behavior, so this single handler is the only source of truth and
 *   cannot double-navigate.
 */

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

let initialized = false;

export function initNativeApp(): void {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;
  void CapacitorApp.addListener('backButton', handleHardwareBack);
}

function handleHardwareBack(): void {
  // React Router (history v5 API) records the position in the session history
  // stack as history.state.idx. idx > 0 means there is an in-app entry to go
  // back to; idx === 0 means the user is at the root and the app should exit.
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) {
    window.history.back();
  } else {
    void CapacitorApp.exitApp();
  }
}
