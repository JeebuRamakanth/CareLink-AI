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
      "work-1-pecrlobigcxsvnqp.prod-runtime.all-hands.dev",
      "work-2-pecrlobigcxsvnqp.prod-runtime.all-hands.dev",
      "work-1-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
      "work-2-jdiilzdraqknuphy.prod-runtime.all-hands.dev",
      "work-1-euhzstetirprmheu.prod-runtime.all-hands.dev",
      "work-2-euhzstetirprmheu.prod-runtime.all-hands.dev",
      "work-1-kzewfmnwekckfrpk.prod-runtime.all-hands.dev",
      "work-2-kzewfmnwekckfrpk.prod-runtime.all-hands.dev",
      "work-1-xqisvachtcqgnggg.prod-runtime.all-hands.dev",
      "work-2-xqisvachtcqgnggg.prod-runtime.all-hands.dev",
      "work-1-wkgbkeqdjmhztwsy.prod-runtime.all-hands.dev",
      "work-2-wkgbkeqdjmhztwsy.prod-runtime.all-hands.dev",
      "work-1-rpygtsqldfnazzlw.prod-runtime.all-hands.dev",
      "work-2-rpygtsqldfnazzlw.prod-runtime.all-hands.dev",
      "work-1-lbltybknbunmwrlb.prod-runtime.all-hands.dev",
      "work-2-lbltybknbunmwrlb.prod-runtime.all-hands.dev",
      "work-1-dggnfyqntcnnvqmy.prod-runtime.all-hands.dev",
      "work-2-dggnfyqntcnnvqmy.prod-runtime.all-hands.dev",
    ],
  },
});
