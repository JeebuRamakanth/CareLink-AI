import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Production security headers (Step 14 §13).
 *
 * A pure SPA cannot set HTTP response headers by itself, so the production
 * <head> carries a Content-Security-Policy + Referrer-Policy via meta tags.
 * Applied at BUILD time only — Vite dev (HMR websocket, React preamble) is
 * untouched. frame-ancestors / X-Content-Type-Options / Permissions-Policy
 * must be set as real HTTP headers by the hosting layer (see public/_headers).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

function securityHeaders(): Plugin {
  return {
    name: "carelink-security-headers",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    securityHeaders(),
  ],
  server: {
    allowedHosts: [
      "work-1-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
      "work-2-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
      "work-1-euhzstetirprmheu.prod-runtime.all-hands.dev",
      "work-2-euhzstetirprmheu.prod-runtime.all-hands.dev",
      "work-1-kzewfmnwekckfrpk.prod-runtime.all-hands.dev",
      "work-2-kzewfmnwekckfrpk.prod-runtime.all-hands.dev",
    ],
  },
});