import { defineConfig } from "vite";

import { createCrazyRummyPwaPlugin } from "./src/pwa/pwa-build.js";

const base = process.env.CRAZY_RUMMY_BASE_PATH || "/";

export default defineConfig({
  base,
  build: {
    target: "es2022",
    sourcemap: true
  },
  plugins: [createCrazyRummyPwaPlugin()]
});
