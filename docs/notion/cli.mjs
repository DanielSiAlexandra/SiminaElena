#!/usr/bin/env node
import { Client, LogLevel } from "@notionhq/client";
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { boards } from "./boards.mjs";
import { createWorkspace, MAX_MARKDOWN_BYTES, newHumanComments, validatePageId } from "./notion.mjs";
import { discover, loadManifest, resolveRoot, saveManifest } from "./discovery.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const statePath = resolve(projectRoot, ".notion-sync-state.json");
const discoveryDirectory = resolve(projectRoot, ".notion-discovery");
const usage = `Usage: node --env-file=.env.private docs/notion/cli.mjs <command>
Content is always Markdown: pass it inline or with --file <path.md> (path relative to the current directory).
  discover                         (refresh ignored manifest for NOTION_ROOT_PAGE)
  boards [--definitions]           (discovered schema, or offline role definitions)
  tree [--rows]
  page "<title>" | "<parent>/<title>"
  page edit <path|page_id> (--replace | --append | --find <text> [--all]) (<markdown> | --file f.md) [--approve=<token>]
       without --approve: preview (diff + token); with the token from an approved preview: apply
  list <board> [limit 1-100] [next_cursor]
  show <board> <page_id>
  sync <board> <page_id>
  create <tasks|issues|failures> <title> [<markdown> | --file f.md] [--status s] [--priority p] [--type t]...
         tasks only: [--effort e] [--description text] [--blocked-by id,id]
  decision <title> (<markdown> | --file f.md) [--category c]...
  document <title> (<markdown> | --file f.md) [--category c]...
  comment <board> <page_id> (<markdown> | --file f.md) [--discussion id]
  status <board> <page_id> <exact status>
  move <board> <page_id> <exact status>
  move <board> <page_id> --to <tasks|issues|failures> [--status s]
  roadmap-status <page_id> <exact status> --approve=<page_id>:<exact status>
  roadmap-comment <page_id> (<markdown> | --file f.md) --approve=<page_id>
Boards: ${Object.keys(boards).join(", ")}`;

const options = {
  file: { type: "string" },
  status: { type: "string" },
  priority: { type: "string" },
  type: { type: "string", multiple: true },
  effort: { type: "string" },
  description: { type: "string" },
  "blocked-by": { type: "string", multiple: true },
  category: { type: "string", multiple: true },
  discussion: { type: "string" },
  to: { type: "string" },
  approve: { type: "string" },
  replace: { type: "boolean" },
  append: { type: "boolean" },
  find: { type: "string" },
  all: { type: "boolean" },
  rows: { type: "boolean" },
  definitions: { type: "boolean" }
};

async function readState() {
  try { return JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveState(state) {
  const temp = `${statePath}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, statePath);
}

async function rememberPosted(rootId, id) {
  const state = await readState();
  state[rootId] ??= {};
  state[rootId].posted = [...(state[rootId].posted ?? []), id].slice(-2000);
  await saveState(state);
  return id;
}

function print(result) {
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

async function markdownFrom(inline, file, required) {
  if (inline !== undefined && file !== undefined) throw new Error("Pass Markdown inline or with --file, not both");
  if (file !== undefined) {
    const path = resolve(process.cwd(), file);
    const info = await stat(path).catch(error => { throw new Error(`Cannot read --file ${file}: ${error.code ?? error.message}`); });
    if (!info.isFile()) throw new Error(`--file ${file} is not a file`);
    if (info.size > MAX_MARKDOWN_BYTES) throw new Error(`--file ${file} exceeds ${MAX_MARKDOWN_BYTES} bytes`);
    return (await readFile(path, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  }
  if (inline === undefined && required) throw new Error("Markdown content is required (inline or --file)");
  return inline;
}

function allowOnly(values, allowed) {
  const extra = Object.keys(values).filter(key => values[key] !== undefined && !allowed.includes(key));
  if (extra.length) throw new Error(`Unsupported option(s) for this command: ${extra.map(key => `--${key}`).join(", ")}\n${usage}`);
}

function fieldsFrom(values) {
  return { status: values.status, priority: values.priority, type: values.type, effort: values.effort,
    description: values.description, "blocked-by": values["blocked-by"], category: values.category };
}

async function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  const [command, ...args] = positionals;
  const arity = (min, max = min) => { if (args.length < min || args.length > max) throw new Error(usage); };
  if (command === "boards" && values.definitions) {
    arity(0); allowOnly(values, ["definitions"]);
    print(boards);
    return;
  }
  if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN is required; pass --env-file=.env.private from the project root or set it in the environment");
  const client = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: "2025-09-03", logLevel: LogLevel.ERROR });
  const root = await resolveRoot(client, process.env.NOTION_ROOT_PAGE);
  if (command === "discover") {
    arity(0); allowOnly(values, []);
    const manifest = await discover(client, root);
    await saveManifest(discoveryDirectory, manifest);
    print({ root, boards: manifest.boards });
    return;
  }
  const manifest = await loadManifest(discoveryDirectory, root);
  const workspace = createWorkspace(client, { root, boards: manifest.boards });
  switch (command) {
    case "boards":
      arity(0); allowOnly(values, []);
      print({ root, boards: manifest.boards });
      break;
    case "tree":
      arity(0); allowOnly(values, ["rows"]);
      print(await workspace.tree({ rows: values.rows }));
      break;
    case "page":
      if (args[0] === "edit" && args.length > 1) {
        args.shift();
        arity(1, 2); allowOnly(values, ["replace", "append", "find", "all", "file", "approve"]);
        const modes = [values.replace && "replace", values.append && "append", values.find !== undefined && "find"].filter(Boolean);
        if (modes.length !== 1) throw new Error("Choose exactly one edit mode: --replace, --append or --find <text>");
        if (values.all && modes[0] !== "find") throw new Error("--all only applies to --find");
        const markdown = await markdownFrom(args[1], values.file, true);
        const edit = { mode: modes[0], markdown, find: values.find, all: values.all };
        print(values.approve === undefined ? await workspace.previewEdit(args[0], edit) : await workspace.edit(args[0], edit, values.approve));
        break;
      }
      arity(1); allowOnly(values, []);
      print(await workspace.page(args[0]));
      break;
    case "list":
      arity(1, 3); allowOnly(values, []);
      print(await workspace.list(args[0], args[1] === undefined ? 20 : Number(args[1]), args[2]));
      break;
    case "show":
      arity(2); allowOnly(values, []);
      print(await workspace.show(args[0], args[1]));
      break;
    case "sync": {
      arity(2); allowOnly(values, []);
      const [board, id] = args;
      const key = `${root.id}:${board}:${validatePageId(id)}`;
      const [comments, me, state] = await Promise.all([workspace.comments(board, id), workspace.me(), readState()]);
      const { incoming, nextSeen } = newHumanComments(comments, me.id, state[key], state[root.id]?.posted);
      print({ page_id: id, new_comments: incoming });
      state[key] = nextSeen;
      await saveState(state);
      break;
    }
    case "create": {
      arity(2, 3); allowOnly(values, ["file", "status", "priority", "type", "effort", "description", "blocked-by", "category"]);
      const markdown = await markdownFrom(args[2], values.file, false);
      const page = await workspace.create(args[0], args[1], { markdown, ...fieldsFrom(values) });
      print({ id: page.id, url: page.url });
      break;
    }
    case "decision":
    case "document": {
      arity(1, 2); allowOnly(values, ["file", "category"]);
      const markdown = await markdownFrom(args[1], values.file, true);
      const page = await workspace.create(command === "decision" ? "decisions" : "documents", args[0], { markdown, category: values.category });
      print({ id: page.id, url: page.url });
      break;
    }
    case "comment": {
      arity(2, 3); allowOnly(values, ["file", "discussion"]);
      const markdown = await markdownFrom(args[2], values.file, true);
      print({ id: await rememberPosted(root.id, (await workspace.comment(args[0], args[1], markdown, values.discussion)).id) });
      break;
    }
    case "status":
      arity(3); allowOnly(values, []);
      print({ id: (await workspace.status(args[0], args[1], args[2])).id, status: args[2] });
      break;
    case "move":
      if (values.to) {
        arity(2); allowOnly(values, ["to", "status"]);
        print(await workspace.move(args[0], args[1], values.to, values.status));
      } else {
        arity(3); allowOnly(values, []);
        print({ id: (await workspace.status(args[0], args[1], args[2])).id, status: args[2] });
      }
      break;
    case "roadmap-status": {
      arity(2); allowOnly(values, ["approve"]);
      const [id, target] = args;
      validatePageId(id);
      if (values.approve !== `${id}:${target}`) throw new Error(`Roadmap change requires explicit per-change permission and --approve=${id}:${target}`);
      print({ id: (await workspace.status("roadmap", id, target, true)).id, status: target });
      break;
    }
    case "roadmap-comment": {
      arity(1, 2); allowOnly(values, ["approve", "file"]);
      const [id] = args;
      validatePageId(id);
      if (values.approve !== id) throw new Error(`Roadmap comment requires explicit per-change permission and --approve=${id}`);
      const markdown = await markdownFrom(args[1], values.file, true);
      print({ id: await rememberPosted(root.id, (await workspace.comment("roadmap", id, markdown, undefined, true)).id) });
      break;
    }
    default:
      throw new Error(usage);
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error(`Notion CLI: ${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`);
  process.exitCode = 1;
});
