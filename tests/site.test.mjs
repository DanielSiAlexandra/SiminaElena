import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = resolve(root, "site");
const read = path => readFile(resolve(root, path), "utf8");

test("Romanian page has landmarks, safe contact and valid navigation", async () => {
  const html = await read("site/index.html");
  assert.match(html, /<html lang="ro">/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  for (const tag of ["header", "nav", "main", "footer"]) assert.match(html, new RegExp(`<${tag}[\\s>]`));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["continut", "despre", "lectii", "intrebari", "contact"]) assert.ok(ids.includes(id));
  for (const [, anchor] of html.matchAll(/href="#([^"]*)"/g)) assert.ok(anchor && ids.includes(anchor));
  assert.match(html, /class="skip-link" href="#continut"/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /De stabilit împreună/);
  assert.doesNotMatch(html, /<form[\s>]|<iframe[\s>]|onclick=|href="#"|testimoniale|70 de ani|pensionar|garantat/i);
  for (const [, url] of html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)) assert.equal(url, "https://www.facebook.com/elena.simina.58");
  assert.ok((html.match(/<details[\s>]/g) ?? []).length >= 3);
});

test("notebook decorations, coherent cards, portrait and contact shortcut are accessible", async () => {
  const html = await read("site/index.html");
  assert.match(html, /class="notebook-binding" aria-hidden="true"/);
  assert.match(html, /class="pen-rail" aria-hidden="true"/);
  assert.match(html, /<a class="contact-shortcut" href="#contact" aria-label="[^"]+"/);
  assert.doesNotMatch(html, /motion-control|motion-help|pause-icon|play-icon/);
  assert.match(html, /src="assets\/elena-simina\.jpg" width="200" height="200" alt="Elena Simina/);
  assert.match(html, /<script type="module" src="main.js"/);
  const portrait = await readFile(resolve(site, "assets/elena-simina.jpg"));
  assert.equal(portrait[0], 0xff);
  assert.equal(portrait[1], 0xd8);
  assert.equal(portrait.includes(Buffer.from("Exif\0\0")), false, "No embedded EXIF metadata");
  assert.doesNotMatch(html, /data-enter|<p[^>]*data-card/);
  assert.equal((html.match(/data-card/g) ?? []).length, 6);
  assert.equal((html.match(/class="note-pin"[^>]*aria-hidden="true"/g) ?? []).length, 6);
  assert.equal((html.match(/<use href="#pushpin"/g) ?? []).length, 6);
  for (const section of ["despre", "lectii", "intrebari", "contact"]) {
    assert.match(html, new RegExp(`<section id="${section}"[^>]* data-card>`));
  }
  const css = await read("site/styles.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.pen-rail\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.pen-rail\s*\{[^}]*overflow:\s*visible/);
  assert.match(css, /\.pen-rail\s*\{[^}]*background:\s*transparent/);
  assert.match(css, /\.pen-rail\s*\{[^}]*z-index:\s*20/);
  assert.match(css, /font-family:\s*"Patrick Hand"/);
  for (const tone of ["yellow", "pink", "blue"]) assert.match(css, new RegExp(`--note-${tone}:\\s*#`));
  assert.doesNotMatch(css, /--note-green/);
  assert.match(css, /\[data-card\]\s*\{[^}]*transform-origin:\s*0 50%/);
  assert.match(css, /@keyframes page-curl/);
  assert.match(css, /@keyframes pin-press/);
  assert.match(css, /\[data-motion-state="entering"\][^]*?\.note-pin/);
  assert.match(css, /\.note-pin\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /@media \(max-width: 900px\)(?:(?!@media)[^])*\.about, \.lessons, \.questions, \.contact \{ grid-template-columns: 1fr;/);
  for (const subset of ["latin", "latin-ext"]) {
    const font = await readFile(resolve(site, `assets/patrick-hand-${subset}.woff2`));
    assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
    assert.match(css, new RegExp(`patrick-hand-${subset}\\.woff2`));
  }
  const licenses = await read("site/assets/third-party-licenses.txt");
  assert.match(licenses, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(licenses, /Lucide message-circle icon/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

test("local source assets resolve and public source is explicitly bounded", async () => {
  const html = await read("site/index.html");
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|#)/.test(url)) continue;
    assert.ok(!url.startsWith("/"));
    const target = resolve(site, url);
    assert.ok(target.startsWith(site + sep));
    assert.ok((await lstat(target)).isFile(), `Missing ${url}`);
  }
  const expected = [
    "assets/elena-simina.jpg", "assets/handwriting.svg", "assets/pen.svg",
    "assets/portrait-placeholder.svg", "assets/patrick-hand-latin-ext.woff2",
    "assets/patrick-hand-latin.woff2", "assets/third-party-licenses.txt",
    "index.html", "main.js", "motion.js", "pen.js", "styles.css",
  ];
  async function walk(directory) {
    const files = [];
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name);
      const stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink());
      if (stat.isDirectory()) files.push(...await walk(path));
      else files.push(relative(site, path).split(sep).join("/"));
    }
    return files;
  }
  assert.deepEqual((await walk(site)).sort(), expected.sort());
  for (const file of expected.filter(path => !/\.(jpg|woff2)$/.test(path))) {
    assert.doesNotMatch(await readFile(resolve(site, file), "utf8"), /personal-info\.txt|NOTION_TOKEN|\.env\.private|fbcdn\.net|reticle/i);
  }
  assert.equal(execFileSync("git", ["ls-files", "--", "personal-info.txt"], { cwd: root, encoding: "utf8" }), "");
  assert.match(await read(".gitignore"), /^\/personal-info\.txt$/m);
  assert.match(await read(".gitignore"), /^\/dist\/$/m);
  execFileSync("git", ["check-ignore", "-q", "personal-info.txt"], { cwd: root });
});

test("Pages builds once, validates dist and deploys only the validated artifact", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /branches: \[master\]/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/master'/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:dist/);
  assert.equal((workflow.match(/run: npm run build/g) ?? []).length, 1);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /name: github-pages/);
  const upload = workflow.match(/uses: actions\/upload-pages-artifact@[a-f0-9]{40}[^]*?with:\s*\n\s+path: ([^\n]+)/);
  assert.equal(upload?.[1], "dist");
  assert.match(workflow, /actions\/download-artifact@[a-f0-9]{40}/);
  for (const [, action] of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(action, /^[\w/-]+@[a-f0-9]{40}(?:\s+#.*)?$/);
});
