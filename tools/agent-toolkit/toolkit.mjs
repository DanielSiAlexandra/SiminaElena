#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sources, profiles, extensions, selection } from "./catalog.mjs";

const home = dirname(fileURLToPath(import.meta.url));
const repo = resolve(home, "../..");
const local = join(repo, ".agent-toolkit");
const win = process.platform === "win32";
const python = join(local, "python", win ? "Scripts/python.exe" : "bin/python");
const uv = join(local, "python", win ? "Scripts/uv.exe" : "bin/uv");
const node = join(home, "node/node_modules/node", win ? "bin/node.exe" : "bin/node");
const npm = join(home, "node/node_modules/npm/bin/npm-cli.js");
const runtime = join(home, "runtime");
const hash = text => createHash("sha256").update(text).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const exists = async path => access(path).then(() => true, error => {
  if (error.code === "ENOENT") return false;
  throw error;
});

export async function command(binary, args, { cwd = repo, env = process.env, timeout = 180000, capture = false } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd, env, shell: false, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    let errors = "";
    if (capture) {
      child.stdout.on("data", data => { output += data; });
      child.stderr.on("data", data => { errors += data; });
    }
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timeout running ${binary}`)); }, timeout);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${binary} exited ${code}${errors ? `: ${errors.slice(-4000)}` : ""}`));
      else done(output.trim());
    });
  });
}

const toolEnv = () => ({
  ...process.env,
  PATH: [dirname(node), join(runtime, "node_modules/.bin"), dirname(python), process.env.PATH].join(delimiter),
  PLAYWRIGHT_BROWSERS_PATH: join(local, "browsers"),
  DO_NOT_TRACK: "1",
  RETICLE_TELEMETRY: "0",
  RETICLE_STATE_DIR: join(local, "reticle"),
  RETICLE_DIR: join(local, "reticle"),
  GRAPHIFY_BACKEND: "none",
  LANGSMITH_TRACING: "false",
  UV_PYTHON_DOWNLOADS: "never",
  PIP_DISABLE_PIP_VERSION_CHECK: "1"
});

async function download(url, path, sha256) {
  if (await exists(path)) {
    const data = await readFile(path);
    if (!sha256 || hash(data) === sha256) return data;
    throw new Error(`Checksum mismatch in cached ${path}; remove only that archive and retry`);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256 && hash(data) !== sha256) throw new Error(`Download checksum mismatch: ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return data;
}

async function lockSources() {
  const lock = { version: 1, sources: {} };
  for (const [key, [repository, revision]] of Object.entries(sources)) {
    const url = `https://codeload.github.com/${repository}/tar.gz/${revision}`;
    const archive = join(local, "cache", `${key}-${revision}.tgz`);
    const data = await download(url, archive);
    lock.sources[key] = { repository, revision, url, sha256: hash(data) };
    console.log(`Locked ${key}: ${data.length} bytes`);
  }
  // This rule file is independently versioned from its wrapper skill.
  const response = await fetch("https://api.github.com/repos/vercel-labs/web-interface-guidelines/commits/main");
  if (!response.ok) throw new Error("Could not resolve web-interface-guidelines revision");
  const revision = (await response.json()).sha;
  const url = `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/${revision}/command.md`;
  const data = await download(url, join(local, "cache", `guidelines-${revision}.md`));
  lock.guidelines = { revision, url, sha256: hash(data) };
  await writeFile(join(home, "sources.lock.json"), JSON.stringify(lock, null, 2) + "\n");
}

async function installSources() {
  const lock = await json(join(home, "sources.lock.json"));
  if (lock.version !== 1 || Object.entries(sources).some(([key, [repository, revision]]) =>
    lock.sources[key]?.repository !== repository || lock.sources[key]?.revision !== revision)) {
    throw new Error("Source lock does not match catalog; review and regenerate it with lock-sources");
  }
  for (const [key, source] of Object.entries(lock.sources)) {
    const target = join(local, "vendor", key);
    const marker = join(target, ".toolkit-source.json");
    if (await exists(marker)) {
      if ((await json(marker)).sha256 !== source.sha256) throw new Error(`${key} source differs; explicitly remove its old vendor directory before updating`);
      continue;
    }
    if (await exists(target)) throw new Error(`Unmanaged/incomplete vendor directory: ${target}`);
    const archive = join(local, "cache", `${key}-${source.revision}.tgz`);
    await download(source.url, archive, source.sha256);
    const listing = await command("tar", ["-tzf", archive], { capture: true });
    if (listing.split("\n").some(path => path.startsWith("/") || path.split("/").includes(".."))) throw new Error(`Unsafe archive paths: ${key}`);
    const stage = `${target}.staging`;
    if (await exists(stage)) throw new Error(`Incomplete extraction: ${stage}; inspect/remove it before retry`);
    await mkdir(stage, { recursive: true });
    await command("tar", ["-xzf", archive, "--strip-components=1", "-C", stage]);
    await writeFile(join(stage, ".toolkit-source.json"), JSON.stringify(source, null, 2));
    await rename(stage, target);
    console.log(`Installed source ${key} at ${source.revision}`);
  }
  const data = await download(lock.guidelines.url, join(local, "cache", `guidelines-${lock.guidelines.revision}.md`), lock.guidelines.sha256);
  await mkdir(join(local, "guidelines"), { recursive: true });
  await writeFile(join(local, "guidelines/command.md"), data);
}

async function setupTools() {
  await mkdir(local, { recursive: true });
  // Bootstrap Node using the caller's npm; subsequent installs run on the isolated modern runtime.
  let bootstrapNpm = process.env.npm_execpath;
  if (!bootstrapNpm) {
    for (const path of (process.env.PATH ?? "").split(delimiter)) {
      const candidate = join(path, win ? "npm.cmd" : "npm");
      if (await exists(candidate)) {
        bootstrapNpm = win ? join(path, "node_modules/npm/bin/npm-cli.js") : await realpath(candidate);
        break;
      }
    }
  }
  if (!bootstrapNpm || !await exists(bootstrapNpm)) throw new Error("Cannot find npm-cli.js; run setup through an existing Node/npm installation");
  await command(process.execPath, [bootstrapNpm, "ci", "--prefix", join(home, "node"), "--no-fund", "--no-audit"], { timeout: 300000 });
  console.log("Local Node:", await command(node, ["--version"], { capture: true }));
  const env = toolEnv();
  await command(node, [npm, "ci", "--prefix", runtime, "--no-fund", "--no-audit"], { env, timeout: 600000 });
  if (!await exists(python)) {
    const candidate = process.env.TOOLKIT_PYTHON ?? (win ? "python" : "python3.12");
    const version = await command(candidate, ["-c", "import sys; assert sys.version_info >= (3,12), 'Python 3.12+ required'; print(sys.version)"], { capture: true });
    console.log("Using Python:", version);
    await command(candidate, ["-m", "venv", join(local, "python")]);
  }
  await command(python, ["-m", "pip", "install", "uv==0.11.6"], { timeout: 300000 });
  await command(uv, ["pip", "sync", join(home, "python-requirements.txt"), "--python", python], { env, timeout: 600000 });
  // Design DNA's measured palette path has its own small dependency tree.
  const dna = join(local, "vendor/dna/scripts");
  await cp(join(home, "dna.package-lock.json"), join(dna, "package-lock.json"));
  await command(node, [npm, "ci", "--prefix", dna, "--no-fund", "--no-audit"], { env, timeout: 300000 });
  // Chromium suffices for the local verification fixture; do not download every browser engine.
  await command(node, [join(runtime, "node_modules/playwright-core/cli.js"), "install", "chromium"], { env, timeout: 600000 });
  await configureBrowser();
}

async function configureBrowser() {
  const executablePath = await command(node, ["-e",
    "console.log(require(process.argv[1]).chromium.executablePath())", join(runtime, "node_modules/playwright-core")
  ], { env: toolEnv(), capture: true });
  await writeFile(join(local, "playwright.json"), JSON.stringify({
    browser: { browserName: "chromium", isolated: true, launchOptions: { executablePath, headless: true } },
    outputDir: join(local, "browser-output")
  }, null, 2));
}

export function wrapper(item) {
  const target = `../../../.agent-toolkit/vendor/${item.source}/${item.path}`;
  const hint = {
    uiux: "For upstream CLAUDE_PLUGIN_ROOT paths, substitute the absolute .agent-toolkit/vendor/uiux root (not this host's bootstrap plugin). Run its .claude/skills/ui-ux-pro-max/scripts/search.py through toolkit run python.",
    genjutsu: `Before running its module-loader block, set GENJUTSU_SKILL_DIR to the absolute .agent-toolkit/vendor/genjutsu/${dirname(item.path)} directory in that same shell call. All _jutsu modules remain in the upstream source tree. Bash is required for the upstream loaders; do not pretend they are portable JavaScript.`,
    taste: "Resolve <skill> to the upstream directory linked below. Run scripts through toolkit run node to use modern Node and the local CHROME_PATH. The old system Node is not suitable for the current director.",
    dna: "Set SKILL_ROOT to the upstream .agent-toolkit/vendor/dna directory. The measurement script dependencies were installed there; do not run a new floating npm install.",
    reticle: "The runtime is installed, but this repo has no instrumented app or registered MCP connection. Ask before enabling either; do not treat CLI version success as a verified Reticle flow."
  }[item.source];
  const preface = hint ? `\n**Runtime/path adapter:** ${hint}\n` : "";
  return `---\nname: ${item.name}\ndescription: ${JSON.stringify(item.description)}\n---\n\n# Managed capability: ${item.name}\n\nRead the repository's AGENTS.md and docs/agent-toolkit/README.md first.\n\nThis is a **local adapter**; the original pinned upstream content remains unchanged outside skill discovery.\nRead [the complete upstream instructions](${target}) and the references/scripts they link before using this capability. Resolve their relative resources against that upstream file, not this adapter.\n${preface}\nUse \`node tools/agent-toolkit/toolkit.mjs run <tool> ...\` for installed executables. Do not run upstream automatic installers, floating @latest commands, global hook configuration, service login, cloud uploads, paid generation or app instrumentation merely because upstream instructions suggest it. Preserve user approval and project policies. If a host-specific API is unavailable, stop and identify the missing capability rather than inventing execution.\n${item.source === "superpowers" ? "\nResolve superpowers:<skill> references to the matching unnamespaced managed skill here. The bootstrap supplies the same rule; other host-specific agents/tools must use the documented host adapter.\n" : ""}${item.resource ? "\nFor web-design-guidelines, use the pinned local rule source at `.agent-toolkit/guidelines/command.md`, not the upstream floating download. This resource substitution is an intentional adaptation.\n" : ""}`;
}

async function superpowersSkills() {
  const parent = join(local, "vendor/superpowers/skills");
  const entries = await readdir(parent, { withFileTypes: true });
  const out = [];
  for (const entry of entries) if (entry.isDirectory() && await exists(join(parent, entry.name, "SKILL.md"))) {
    const raw = await readFile(join(parent, entry.name, "SKILL.md"), "utf8");
    const description = raw.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "");
    out.push({ source: "superpowers", path: `skills/${entry.name}/SKILL.md`, name: entry.name,
      description: description ?? `Superpowers ${entry.name} process skill.` });
  }
  return out;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Managed directory contains a symlink: ${entry.name}`);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

export async function activate(profile, extras, root = repo, processSkills) {
  const selected = [...(processSkills ?? await superpowersSkills()), ...selection(profile, extras)];
  if (selected.some(item => !/^[a-z0-9][a-z0-9-]*$/.test(item.name))) throw new Error("Unsafe skill name");
  if (root === repo) for (const item of selected) await access(join(local, "vendor", item.source, item.path));
  if (new Set(selected.map(item => item.name)).size !== selected.length) throw new Error("Duplicate installed skill names");
  const agents = join(root, ".agents");
  await mkdir(agents, { recursive: true });
  const lockPath = join(agents, ".toolkit-switch.lock");
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another profile switch is active (or interrupted); inspect .agents/.toolkit-switch.lock");
    throw error;
  }
  try {
  const active = join(agents, "skills");
  const managedPath = join(agents, ".toolkit-managed.json");
  const old = await exists(managedPath) ? await json(managedPath) : null;
  if (await exists(active)) {
    if (!old) throw new Error("Existing unmanaged .agents/skills directory; no files will be overwritten");
    const files = await filesUnder(active);
    for (const file of files) {
      const name = relative(active, file).replaceAll("\\", "/");
      if (old.files[name] !== hash(await readFile(file))) throw new Error(`Unmanaged/modified skill file: ${name}`);
    }
    if (Object.keys(old.files).length !== files.length) throw new Error("Managed skill files were removed; refusing overwrite");
  }
  // Competing host discovery roots must not silently shadow the managed library.
  for (const path of [".github/skills", ".claude/skills"]) {
    if (await exists(join(root, path)) && (await readdir(join(root, path))).length) throw new Error(`Existing ${path}: resolve duplicate host discovery before activation`);
  }
  const stage = join(agents, `skills.staging-${process.pid}`);
  await mkdir(stage, { recursive: true });
  const manifest = { version: 1, profile, extras, files: {} };
  for (const item of selected) {
    const content = wrapper(item);
    await mkdir(join(stage, item.name), { recursive: true });
    await writeFile(join(stage, item.name, "SKILL.md"), content);
    manifest.files[`${item.name}/SKILL.md`] = hash(content);
  }
  const backup = join(agents, "skills.previous");
  if (await exists(backup)) throw new Error("Previous profile backup exists; inspect it before retrying");
  if (await exists(active)) await rename(active, backup);
  try {
    await rename(stage, active);
    await writeFile(`${managedPath}.tmp`, JSON.stringify(manifest, null, 2) + "\n");
    await rename(`${managedPath}.tmp`, managedPath);
  } catch (error) {
    if (await exists(backup)) {
      await rm(active, { recursive: true, force: true });
      await rename(backup, active);
    }
    throw error;
  }
  if (await exists(backup)) await rm(backup, { recursive: true });
  console.log(`Activated ${profile}${extras.length ? ` + ${extras.join(", ")}` : ""}: ${selected.length} skills. Restart/reload your agent; existing sessions retain loaded instructions.`);
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}

async function bootstrap() {
  const directory = join(local, "bootstrap");
  await mkdir(join(directory, ".claude-plugin"), { recursive: true });
  await mkdir(join(directory, "hooks"), { recursive: true });
  await writeFile(join(directory, ".claude-plugin/plugin.json"), JSON.stringify({
    name: "repo-superpowers-bootstrap", version: "1.0.0", description: "Repo-local shared-skill Superpowers bootstrap adapter (no duplicate skill copies)."
  }, null, 2));
  await cp(join(home, "bootstrap.mjs"), join(directory, "hooks/bootstrap.mjs"));
  await writeFile(join(directory, "hooks/hooks.json"), JSON.stringify({
    hooks: { SessionStart: [{ matcher: "startup|clear|compact", hooks: [{
      type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/../../tools/agent-toolkit/node/node_modules/node/bin/node" "${CLAUDE_PLUGIN_ROOT}/hooks/bootstrap.mjs"',
      shell: "bash", async: false
    }] }] }
  }, null, 2));
}

export async function runTool(name, args) {
  const env = toolEnv();
  if (await exists(join(local, "playwright.json"))) {
    env.CHROME_PATH = (await json(join(local, "playwright.json"))).browser.launchOptions.executablePath;
  }
  // Service tools get dedicated local state, never the user's existing provider/login configuration.
  if (["reticle", "omniroute", "superdesign"].includes(name)) {
    const home = join(local, "homes", name);
    await mkdir(home, { recursive: true });
    env.HOME = home;
    env.USERPROFILE = home;
    env.XDG_CONFIG_HOME = join(home, ".config");
    env.XDG_DATA_HOME = join(home, ".local/share");
  }
  const nodeTools = { "playwright-cli": "@playwright/cli", reticle: "@reticlehq/server", superdesign: "@superdesign/cli", "better-icons": "better-icons", omniroute: "omniroute" };
  if (name === "node") return command(node, args, { env });
  if (name === "npm") return command(node, [npm, ...args], { env, timeout: 600000 });
  if (name === "python") return command(python, args, { env });
  if (["graphify", "skillspector"].includes(name)) {
    return command(join(dirname(python), win ? `${name}.exe` : name), args, { env, timeout: 600000 });
  }
  if (Object.hasOwn(nodeTools, name)) {
    const dir = join(runtime, "node_modules", nodeTools[name]);
    const pkg = await json(join(dir, "package.json"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[name] ?? Object.values(pkg.bin)[0];
    const commandArgs = [...args];
    if (name === "playwright-cli" && args[0] === "open" && !args.some(arg => arg.startsWith("--config"))) {
      commandArgs.push("--config", join(local, "playwright.json"));
    }
    return command(node, [join(dir, bin), ...commandArgs], { env, timeout: 600000 });
  }
  if (["copilot", "claude"].includes(name)) {
    if (win) throw new Error("Plugin bootstrap launcher currently requires Bash; use shared skills and manual bootstrap on Windows (see README)");
    return command(name, ["--plugin-dir", join(local, "bootstrap"), ...args], { env, timeout: 86400000 });
  }
  throw new Error(`Unknown tool ${name}`);
}

async function doctor() {
  const checks = { node: [node, ["--version"]], python: [python, ["--version"]],
    graphify: [join(dirname(python), win ? "graphify.exe" : "graphify"), ["--version"]],
    skillspector: [join(dirname(python), win ? "skillspector.exe" : "skillspector"), ["--version"]] };
  let failed = false;
  for (const [name, [binary, args]] of Object.entries(checks)) {
    try { console.log(`${name}: ${await command(binary, args, { env: toolEnv(), capture: true })}`); }
    catch (error) { failed = true; console.error(`${name}: ${error.message}`); }
  }
  const active = join(repo, ".agents/.toolkit-managed.json");
  console.log("Profile:", await exists(active) ? (await json(active)).profile : "not activated");
  const allSkills = [...await superpowersSkills(), ...selection("base"),
    ...Object.values(profiles).flatMap(profile => profile.skills), ...Object.values(extensions).flat()];
  for (const item of allSkills) {
    try { await access(join(local, "vendor", item.source, item.path)); }
    catch (error) { failed = true; console.error(`Missing source ${item.name}: ${error.message}`); }
  }
  for (const path of [
    "superpowers/skills/requesting-code-review/code-reviewer.md",
    "genjutsu/skills/_jutsu/motion-principles/SKILL.md",
    "uiux/.claude/skills/ui-ux-pro-max/scripts/search.py",
    "dna/scripts/measure-colors.mjs",
    "taste/skills/taste-skill/scripts/inspect.mjs",
    "graphify/graphify/skills/agents/references/query.md"
  ]) {
    try { await access(join(local, "vendor", path)); }
    catch (error) { failed = true; console.error(`Missing supporting resource ${path}: ${error.message}`); }
  }
  console.log(`Catalog: ${new Set(allSkills.map(item => item.name)).size} consumer skills; sources checked.`);
  for (const name of ["@playwright/cli", "@reticlehq/server", "@superdesign/cli", "better-icons", "omniroute"]) {
    try { console.log(`${name}: ${(await json(join(runtime, "node_modules", name, "package.json"))).version}`); }
    catch (error) { failed = true; console.error(`Missing tool ${name}: ${error.message}`); }
  }
  console.log("Audit warning: OmniRoute has unresolved braces/micromatch/http-proxy-middleware high-severity dependency findings; keep it stopped (see README).");
  console.log("Service state: OmniRoute unconnected; Reticle uninstrumented; Superdesign not authenticated/tested.");
  if (failed) throw new Error("Doctor found missing or broken tools");
}

async function main(args) {
  const [action, sub, ...rest] = args;
  if (action === "lock-sources") return lockSources();
  if (action === "setup") {
    await installSources();
    await setupTools();
    await bootstrap();
    await activate("app", []);
    return doctor();
  }
  if (action === "sources") return installSources();
  if (action === "bootstrap") return bootstrap();
  if (action === "browser-config") return configureBrowser();
  if (action === "doctor") return doctor();
  if (action === "run") return runTool(sub, rest);
  if (action === "profile" && sub === "list") {
    console.log(JSON.stringify({ profiles: Object.fromEntries(Object.entries(profiles).map(([key, value]) => [key, value.description])), extensions: Object.keys(extensions) }, null, 2));
    return;
  }
  if (action === "profile" && sub === "use" && rest[0]) {
    const [name, ...extras] = rest;
    if (extras.some(extra => !extra.startsWith("+"))) throw new Error("Extensions use +name, e.g. profile use app +gsap +three");
    return activate(name, extras.map(extra => extra.slice(1)));
  }
  throw new Error("Use: setup | doctor | profile list | profile use <name> [+extension ...] | run <tool> [args...]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Agent toolkit: ${error.message}`); process.exitCode = 1; });
}
