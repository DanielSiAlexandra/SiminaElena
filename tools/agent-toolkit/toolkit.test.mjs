import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { profiles, extensions, selection, sources } from "./catalog.mjs";
import { activate, wrapper } from "./toolkit.mjs";

const home = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(home, "../..");

test("catalog pins every source and exposes one visual director at a time", async () => {
  const lock = JSON.parse(await readFile(join(home, "sources.lock.json"), "utf8"));
  for (const [key, [repository, revision]] of Object.entries(sources)) {
    assert.match(revision, /^[a-f0-9]{40}$/);
    assert.equal(lock.sources[key].repository, repository);
    assert.equal(lock.sources[key].revision, revision);
    assert.match(lock.sources[key].sha256, /^[a-f0-9]{64}$/);
  }
  for (const profile of Object.keys(profiles)) {
    const list = selection(profile);
    assert.equal(list.length, 11 + profiles[profile].skills.length);
    assert.equal(new Set(list.map(item => item.name)).size, list.length);
    assert.ok(!list.some(item => ["gpt-taste", "full-output-enforcement", "ui-skills-root", "improve-ui"].includes(item.name)));
  }
  assert.throws(() => selection("bad"), /Unknown profile/);
  assert.throws(() => selection("baseline-react", ["gsap"]), /cannot enable/);
  assert.throws(() => selection("baseline-react", ["motion"]), /cannot enable/);
  assert.throws(() => selection("app", ["not-a-pack"]), /Unknown extension/);
  assert.throws(() => selection("app", ["gsap", "gsap"]), /Duplicate/);
  assert.throws(() => selection("genjutsu-bunshin", ["cast"]), /separately/);
  assert.equal(extensions.gsap.length, 8);
  assert.equal(extensions.three.length, 10);
});

test("wrappers transparently point to intact upstream resources, not floating installers", () => {
  const item = selection("app").find(skill => skill.name === "ui-ux-pro-max");
  const text = wrapper(item);
  assert.match(text, /local adapter/);
  assert.match(text, /vendor\/uiux\/\.claude\/skills\/ui-ux-pro-max\/SKILL.md/);
  assert.match(text, /not this adapter/);
  assert.match(text, /Do not run upstream automatic installers/);
  assert.match(wrapper(selection("base").find(skill => skill.name === "web-design-guidelines")), /pinned local rule source/);
});

test("profile switching is repeatable, excludes inactive directors and preserves unmanaged files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-profile-"));
  try {
    await activate("app", [], dir, []);
    let active = await readdir(join(dir, ".agents/skills"));
    assert.ok(active.includes("ui-ux-pro-max"));
    assert.ok(!active.includes("paint"));
    await activate("public-site", ["gsap", "three"], dir, []);
    active = await readdir(join(dir, ".agents/skills"));
    assert.ok(active.includes("design-taste-frontend"));
    assert.ok(active.includes("gsap-core"));
    assert.ok(!active.includes("ui-ux-pro-max"));
    await activate("public-site", ["gsap", "three"], dir, []);
    const managed = JSON.parse(await readFile(join(dir, ".agents/.toolkit-managed.json"), "utf8"));
    assert.equal(managed.profile, "public-site");
    await writeFile(join(dir, ".agents/skills/design-taste-frontend/SKILL.md"), "my customization");
    await assert.rejects(activate("soft", [], dir, []), /modified skill/);
    assert.equal(await readFile(join(dir, ".agents/skills/design-taste-frontend/SKILL.md"), "utf8"), "my customization");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("unmanaged directories, duplicate discovery roots and unsafe names are refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-profile-"));
  try {
    await mkdir(join(dir, ".agents/skills"), { recursive: true });
    await writeFile(join(dir, ".agents/skills/custom.md"), "leave it");
    await assert.rejects(activate("app", [], dir, []), /unmanaged/);
    assert.equal(await readFile(join(dir, ".agents/skills/custom.md"), "utf8"), "leave it");
    await rm(join(dir, ".agents/skills"), { recursive: true });
    await mkdir(join(dir, ".github/skills/custom"), { recursive: true });
    await assert.rejects(activate("app", [], dir, []), /Existing .github/);
    await assert.rejects(activate("app", [], dir, [{ name: "../escape" }]), /Unsafe skill name/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("concurrent or interrupted profile switches are refused without touching installed skills", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-profile-"));
  try {
    await activate("app", [], dir, []);
    await writeFile(join(dir, ".agents/.toolkit-switch.lock"), "another process");
    await assert.rejects(activate("soft", [], dir, []), /Another profile switch/);
    const installed = JSON.parse(await readFile(join(dir, ".agents/.toolkit-managed.json"), "utf8"));
    assert.equal(installed.profile, "app");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("runtime package versions and lockfiles match the requested pinned tools", async () => {
  for (const area of ["node", "runtime"]) {
    const pkg = JSON.parse(await readFile(join(home, area, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(home, area, "package-lock.json"), "utf8"));
    assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
    for (const version of Object.values(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
  }
  const ignored = await readFile(join(root, ".gitignore"), "utf8");
  for (const path of [".agent-toolkit/", ".agents/skills/", ".agents/.toolkit-managed.json", "tools/agent-toolkit/runtime/node_modules/"]) {
    assert.ok(ignored.split("\n").includes(path), path);
  }
});
