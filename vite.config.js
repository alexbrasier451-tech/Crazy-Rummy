import { defineConfig } from "vite";

import { createCrazyRummyPwaPlugin } from "./src/pwa/pwa-build.js";
import { validateAssetRegister } from "./tools/validate-v11-assets.mjs";

const base = process.env.CRAZY_RUMMY_BASE_PATH || "/";

function createV11AssetValidationPlugin() {
  return {
    name: "crazy-rummy-v11-asset-validation",
    apply: "build",
    async buildStart() {
      await validateAssetRegister();
    }
  };
}

export default defineConfig({
  base,
  build: {
    target: "es2022",
    sourcemap: true
  },
  plugins: [
    createV11AssetValidationPlugin(),
    createCrazyRummyPwaPlugin()
  ]
});
