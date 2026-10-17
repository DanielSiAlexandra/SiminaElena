import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = resolve(root, "site");
const read = path => readFile(resolve(root, path), "utf8");

test("Romanian page has semantic landmarks and complete navigation", async () => {
  const html = await read("site/index.html");
  assert.match(html, /<html lang="ro">/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  for (const tag of ["header", "nav", "main", "footer"]) {
    assert.match(html, new RegExp(`<${tag}[\\s>]`));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
  for (const id of ["continut", "despre", "lectii", "intrebari", "contact"]) {
    assert.ok(ids.includes(id), `Missing section ${id}`);
  }
  for (const [, anchor] of html.matchAll(/href="#([^"]*)"/g)) {
    assert.ok(anchor && ids.includes(anchor), `Broken anchor #${anchor}`);
  }
  assert.match(html, /class="skip-link" href="#continut"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
});

test("contact works without script and unknown logistics are honest", async () => {
  const html = await read("site/index.html");
  assert.match(html, /href="https:\/\/www\.facebook\.com\/elena\.simina\.58"/);
  assert.match(html, /De stabilit împreună/);
  assert.match(html, /Ilustrație/);
  assert.doesNotMatch(html, /<form[\s>]|<iframe[\s>]|onclick=|href="#"|href="(?:tel:|mailto:)"/i);
  assert.doesNotMatch(html, /testimoniale|70 de ani|pensionar|garantat|★★★★★/i);
  for (const [, url] of html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)) {
    assert.equal(url, "https://www.facebook.com/elena.simina.58", "Only approved external contact link");
  }
  assert.ok((html.match(/<details[\s>]/g) ?? []).length >= 3, "Native practical questions");
});

test("all local assets resolve relative to the project Pages path", async () => {
  const html = await read("site/index.html");
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|#)/.test(url)) continue;
    assert.ok(!url.startsWith("/"), `Root-relative asset breaks project Pages: ${url}`);
    const target = resolve(site, url);
    assert.ok(target.startsWith(site + sep), `Asset escapes public directory: ${url}`);
    assert.ok((await lstat(target)).isFile(), `Missing asset ${url}`);
    assert.equal(new URL(url, "https://example.test/SiminaElena/").pathname, `/SiminaElena/${url}`);
  }
  for (const [, attrs] of html.matchAll(/<img\b([^>]+)>/g)) {
    assert.match(attrs, /\balt="[^"]+"/);
    assert.match(attrs, /\bwidth="\d+"/);
    assert.match(attrs, /\bheight="\d+"/);
  }
});

test("public artifact contains only explicitly allowed static files and no symlinks", async () => {
  const expected = [
    "assets/portrait-placeholder.svg",
    "index.html",
    "main.js",
    "styles.css",
  ];
  async function walk(directory) {
    const files = [];
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name);
      const stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink(), `Never deploy symlink ${name}`);
      if (stat.isDirectory()) files.push(...await walk(path));
      else files.push(relative(site, path).split(sep).join("/"));
    }
    return files;
  }
  assert.deepEqual((await walk(site)).sort(), expected);
  for (const file of expected) {
    assert.doesNotMatch(await readFile(resolve(site, file), "utf8"), /personal-info\.txt|NOTION_TOKEN|\.env\.private|\.agent-toolkit|reticle/i);
  }
  assert.equal(execFileSync("git", ["ls-files", "--", "personal-info.txt"], { cwd: root, encoding: "utf8" }), "");
  assert.match(await read(".gitignore"), /^\/personal-info\.txt$/m);
  execFileSync("git", ["check-ignore", "-q", "personal-info.txt"], { cwd: root });
});

test("motion is optional, respects preference changes and does not hide content", async () => {
  const css = await read("site/styles.css");
  const script = await read("site/main.js");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /transition:\s*all|opacity:\s*0(?:[;\s}]|$)/);
  for (const reduced of [false, true]) {
    const animations = [];
    const cancelled = [];
    let preferenceChange;
    let intersect;
    const element = {
      animate(frames, options) {
        animations.push({ frames, options });
        return { cancel() { cancelled.push(true); } };
      },
    };
    const observed = [];
    const preference = { matches: reduced, addEventListener(type, callback) { preferenceChange = callback; } };
    const context = {
      window: { matchMedia: () => preference },
      document: { querySelectorAll: () => [element] },
      IntersectionObserver: class {
        constructor(callback) { intersect = callback; }
        observe(target) { observed.push(target); }
        unobserve() {}
      },
    };
    vm.runInNewContext(script, context);
    if (reduced) {
      assert.equal(observed.length, 0);
      assert.equal(animations.length, 0);
    } else {
      assert.equal(observed.length, 1);
      intersect([{ target: element, isIntersecting: true }]);
      assert.equal(animations.length, 1);
      assert.ok(animations[0].options.duration <= 600);
      preference.matches = true;
      preferenceChange();
      assert.equal(cancelled.length, 1);
    }
  }
  vm.runInNewContext(script, {
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: { querySelectorAll: () => [] },
  });
});

test("Pages workflow validates before publishing only the public directory", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /branches: \[master\]/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/master'/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
  assert.match(workflow, /node --test tests\/site\.test\.mjs/);
  assert.match(workflow, /node --check site\/main\.js/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /name: github-pages/);
  const upload = workflow.match(/uses: actions\/upload-pages-artifact@[a-f0-9]{40}[^]*?with:\s*\n\s+path: ([^\n]+)/);
  assert.equal(upload?.[1], "site");
  for (const [, action] of workflow.matchAll(/uses: ([^\n]+)/g)) {
    assert.match(action, /^[\w/-]+@[a-f0-9]{40}(?:\s+#.*)?$/);
  }
});
