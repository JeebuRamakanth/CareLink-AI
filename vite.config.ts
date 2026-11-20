import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // The work-host name changes on every workspace; matching the parent
    // domain keeps dev/browser verification working without a growing list of
    // stale entries (a missing host makes Vite answer "Blocked request").
    allowedHosts: [
      ".prod-runtime.all-hands.dev",
      "localhost",
      "127.0.0.1",
    ],
  },
});
