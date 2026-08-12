import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: [
      "work-1-tocqbopnzrtifwap.prod-runtime.all-hands.dev",
      "work-2-tocqbopnzrtifwap.prod-runtime.all-hands.dev",
      "work-1-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
      "work-2-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
    ],
  },
});