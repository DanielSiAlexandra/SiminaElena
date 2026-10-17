import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import test from "node:test";

const output = resolve("dist");

test("production artifact is isolated, minified and contains only public assets", async () => {
  const html = await readFile(resolve(output, "index.html"), "utf8");
  assert.match(html, /lang="ro"/);
  assert.ok(!html.includes("<!--"), "HTML comments removed");
  assert.ok(html.split("\n").length <= 2, "HTML whitespace minified");
  const files = [];
  async function walk(directory) {
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name);
      const stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink(), "No public symlinks");
      if (stat.isDirectory()) await walk(path);
      else files.push(relative(output, path).split(sep).join("/"));
    }
  }
  await walk(output);
  assert.ok(files.some(path => /assets\/.+-[\w-]+\.js$/.test(path)), "Hashed JS bundle");
  assert.ok(files.some(path => /assets\/.+-[\w-]+\.css$/.test(path)), "Hashed CSS bundle");
  assert.equal(files.filter(path => /\.woff2$/.test(path)).length, 2, "Both local font subsets published");
  for (const file of files) {
    assert.match(file, /^(?:index\.html|assets\/third-party-licenses-[\w-]+\.txt|assets\/[\w.-]+\.(?:js|css|svg|jpg|woff2))$/);
    assert.doesNotMatch(file, /\.map$|personal-info|toolkit|\.env|node_modules/);
    if (/\.(?:html|js|css|svg)$/.test(file)) {
      const text = await readFile(resolve(output, file), "utf8");
      assert.doesNotMatch(text, /personal-info\.txt|NOTION_TOKEN|\.env\.private|fbcdn\.net|sourceMappingURL/);
      if (/\.(js|css)$/.test(file)) assert.ok(text.split("\n").length < 12, `${file} minified`);
    }
  }
  for (const [, link] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|#|data:)/.test(link)) continue;
    assert.ok(link.startsWith("./"), `Project-relative built URL: ${link}`);
    assert.ok(files.includes(link.slice(2)), `Asset exists: ${link}`);
  }
});
