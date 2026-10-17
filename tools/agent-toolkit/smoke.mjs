import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { command, runTool } from "./toolkit.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = resolve(root, ".agent-toolkit/smoke");
await mkdir(resolve(dir, "code"), { recursive: true });
await mkdir(resolve(dir, "skill"), { recursive: true });
await writeFile(resolve(dir, "code/example.py"), "def add(a, b):\n    return a + b\n\ndef double(value):\n    return add(value, value)\n");
await writeFile(resolve(dir, "skill/SKILL.md"), "---\nname: harmless-arithmetic\ndescription: Explain addition when asked about arithmetic.\n---\n\nExplain addition. Do not run commands, read files or use the network.\n");
await runTool("graphify", ["extract", resolve(dir, "code"), "--code-only", "--no-cluster", "--out", resolve(dir, "graph")]);
const graph = JSON.parse(await readFile(resolve(dir, "graph/graphify-out/graph.json"), "utf8"));
if (!graph.nodes?.length) throw new Error("Graphify returned no nodes for the local fixture");
console.log(`Graphify: ${graph.nodes.length} local code nodes; backend disabled.`);
await runTool("skillspector", ["scan", resolve(dir, "skill"), "--no-llm", "--format", "json", "--output", resolve(dir, "scan.json")]);
JSON.parse(await readFile(resolve(dir, "scan.json"), "utf8"));
console.log("SkillSpector: local static scan report parsed (not a safety certification).");

const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><html lang="en"><title>Toolkit local check</title><body><h1>Local toolkit check</h1><button onclick="this.textContent=\\\'Clicked\\\'">Click me</button></body></html>');
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
try {
  const address = `http://127.0.0.1:${server.address().port}`;
  await runTool("playwright-cli", ["open", address, "--idle-timeout=15000"]);
  await runTool("playwright-cli", ["screenshot", "--filename", resolve(dir, "browser.png")]);
  const screenshot = await readFile(resolve(dir, "browser.png"));
  if (screenshot.length < 100) throw new Error("Empty browser screenshot");
  console.log(`Browser: localhost screenshot saved (${screenshot.length} bytes).`);
} finally {
  await runTool("playwright-cli", ["close"]);
  await new Promise(done => server.close(done));
}
await command(process.execPath, [resolve(root, ".agent-toolkit/bootstrap/hooks/bootstrap.mjs")], { capture: true });
console.log("Superpowers: repo bootstrap emits context without any model request.");
