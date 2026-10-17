import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("./site/", import.meta.url));

export default defineConfig({
  root: site,
  envDir: site,
  envPrefix: "PUBLIC_SITE_",
  base: "./",
  publicDir: false,
  server: {
    fs: {
      strict: true,
      allow: [site],
      deny: ["**/.env*", "**/personal-info.txt", "**/.agent-toolkit/**"],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: true,
    cssMinify: true,
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});
