import { build } from "vite";
import { minify } from "html-minifier-terser";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

await build({ configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)) });
const html = new URL("../dist/index.html", import.meta.url);
const output = await minify(await readFile(html, "utf8"), {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  useShortDoctype: true,
  keepClosingSlash: true,
});
await writeFile(html, output);
