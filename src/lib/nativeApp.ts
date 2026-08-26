import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Wires the Android hardware back button into the SPA history.
 *
 * Capacitor does NOT connect the hardware back button to web history by
 * default — without this the button is dead inside the app. React Router
 * stores the current history index in `history.state.idx`, so we navigate
 * back while a previous entry exists and exit the app at the root.
 *
 * No-op on the web (the browser already handles back navigation).
 */
export function registerNativeBackButton(): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => undefined;
  }

  const listener = App.addListener("backButton", () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });

  return () => {
    void listener.then((handle) => handle.remove());
  };
}
