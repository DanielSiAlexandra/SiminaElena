import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProperties, createWorkspace, lineDiff, newHumanComments, validateMarkdown } from "./notion.mjs";
import { assertInRoot, discover, loadManifest, resolveRoot, saveManifest } from "./discovery.mjs";
import { paginate } from "./api.mjs";
import { fixture } from "./fixture.mjs";
import { activate } from "../../tools/agent-toolkit/toolkit.mjs";

test("root resolves UUID, Notion URL or exact name; no duplicate or view-ID guesses", async () => {
  const f = await fixture();
  assert.equal((await resolveRoot(f.client, " workspace ")).id, f.root.id);
  assert.equal((await resolveRoot(f.client, `https://app.notion.com/p/New-${f.root.id}?v=ignored`)).id, f.root.id);
  assert.equal((await resolveRoot(f.client, f.root.id.toUpperCase())).id, f.root.id);
  await assert.rejects(resolveRoot(f.client, ""), /required/);
  await assert.rejects(resolveRoot(f.client, "Work"), /No accessible root/);
  await assert.rejects(resolveRoot(f.client, "https://evil.com/" + f.root.id), /Notion page URL/);
  await assert.rejects(resolveRoot(f.client, "https://notion.so/?v=" + f.root.id), /not a view ID/);
  f.page("Workspace", { type: "workspace" });
  await assert.rejects(resolveRoot(f.client, "Workspace"), /ambiguous/);
});

test("name lookup paginates; renamed/replacement roots never reuse a cached root by name", async () => {
  const f = await fixture();
  const replacement = f.page("Replacement", { type: "workspace" });
  f.client.search = async ({ start_cursor }) => start_cursor
    ? { results: [replacement], has_more: false } : { results: [f.rootPage], has_more: true, next_cursor: "next" };
  assert.equal((await resolveRoot(f.client, "Replacement")).id, replacement.id);
  f.rootPage.properties.Name.title[0].plain_text = "Old";
  replacement.properties.Name.title[0].plain_text = "Workspace";
  assert.equal((await resolveRoot(f.client, "Workspace")).id, replacement.id);
});

test("two copies with the same structure discover distinct IDs and live title/options", async () => {
  const a = await fixture(1);
  const b = await fixture(2);
  for (const f of [a, b]) {
    assert.equal(f.manifest.boards.tasks.title, "Live title");
    assert.deepEqual(f.manifest.boards.tasks.props.priority.options, ["High", "Low"]);
    const listed = await f.api.list("tasks");
    assert.equal(listed.items[0].title, "Example");
    await f.api.create("tasks", "New", { markdown: "## Markdown\n```mermaid\nA-->B\n```", type: ["Bug"], status: undefined });
    const payload = f.calls.find(call => call.kind === "create").payload;
    assert.equal(payload.parent.data_source_id, f.sources.tasks.id);
    assert.equal(payload.properties.Status.status.name, "Not started");
    assert.ok(payload.properties["Live title"]);
    assert.equal(payload.children, undefined);
  }
  assert.notEqual(a.manifest.boards.tasks.source, b.manifest.boards.tasks.source);
});

test("missing boards disabled, duplicate paths and compatible sources ambiguous", async () => {
  const f = await fixture();
  const list = f.children.get(f.development.id);
  list.splice(list.findIndex(block => block.id === f.databases.documents.id), 1);
  let m = await f.refresh();
  assert.match(m.boards.documents.unavailable, /Missing/);
  await assert.rejects(createWorkspace(f.client, { root: f.root, boards: m.boards }).create("documents", "D", { markdown: "x" }), /unavailable/);
  list.push({ id: f.databases.tasks.id, type: "child_database" });
  m = await f.refresh();
  assert.match(m.boards.tasks.unavailable, /Ambiguous path/);
  list.pop();
  const duplicate = structuredClone(f.sources.tasks);
  duplicate.id = f.id();
  f.objects.set(duplicate.id, duplicate);
  f.databases.tasks.data_sources.push({ id: duplicate.id });
  assert.match((await f.refresh()).boards.tasks.unavailable, /Ambiguous data sources/);
});

test("discovery finds child databases in layout containers with cursor pagination", async () => {
  const f = await fixture();
  const blocks = f.children.get(f.development.id);
  const container = { id: f.id(), type: "column_list", has_children: true, parent: { type: "page_id", page_id: f.development.id } };
  f.objects.set(container.id, container);
  f.children.set(container.id, blocks);
  f.children.set(f.development.id, [container]);
  f.databases.tasks.parent = { type: "block_id", block_id: container.id };
  const original = f.client.blocks.children.list;
  f.client.blocks.children.list = async args => {
    if (args.block_id !== container.id) return original(args);
    return args.start_cursor ? { results: blocks.slice(2), has_more: false }
      : { results: blocks.slice(0, 2), has_more: true, next_cursor: "next" };
  };
  assert.equal((await f.refresh()).boards.tasks.database, f.databases.tasks.id);
});

test("schema drift, absent optional flags, wrong types and external relations are explicit", async () => {
  const f = await fixture();
  delete f.sources.tasks.properties.Description;
  f.sources.tasks.properties.Priority.type = "rich_text";
  f.sources.tasks.properties["Blocked by"].relation.data_source_id = f.sources.issues.id;
  f.sources.tasks.properties.Blocking.relation.data_source_id = f.sources.issues.id;
  const m = await f.refresh();
  assert.equal(m.boards.tasks.props.description, undefined);
  assert.match(m.boards.tasks.disabled.priority, /expected select/);
  assert.match(m.boards.tasks.disabled["blocked-by"], /discovered Tasks/);
  assert.deepEqual(m.boards.tasks.readOnly, []);
  await assert.rejects(f.api.create("tasks", "T"), /Schema.*changed/);
  const runtime = createWorkspace(f.client, { root: f.root, boards: m.boards });
  await assert.rejects(runtime.create("tasks", "T", { description: "x" }), /not supported/);
  delete f.sources.issues.properties.Status;
  assert.match((await f.refresh()).boards.issues.unavailable, /Required Status/);
});

test("API errors are never treated as missing boards or partial success", async () => {
  const f = await fixture();
  f.client.dataSources.retrieve = async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); };
  await assert.rejects(f.refresh(), /forbidden/);
  await assert.rejects(paginate(async () => ({ results: [], has_more: true })), /no cursor/);
  await assert.rejects(paginate(async () => ({ results: [], request_status: { type: "incomplete" } })), /incomplete/);
});

test("ignored manifests are root-keyed and preserve unavailable-board diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "notion-manifest-"));
  try {
    const a = await fixture(1);
    const b = await fixture(2);
    await saveManifest(dir, a.manifest);
    assert.equal((await loadManifest(dir, a.root)).boards.tasks.source, a.sources.tasks.id);
    await assert.rejects(loadManifest(dir, b.root), /Run discover/);
    await saveManifest(dir, b.manifest);
    assert.equal((await loadManifest(dir, b.root)).boards.tasks.source, b.sources.tasks.id);
    await writeFile(join(dir, `${b.root.id}.json`), '{"version":0}');
    await assert.rejects(loadManifest(dir, b.root), /outdated discovery/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("writes reject renamed boards and live schema changes without making mutations", async () => {
  const f = await fixture();
  f.sources.tasks.properties["Task type"].multi_select.options.push({ name: "New type" });
  await assert.rejects(f.api.status("tasks", f.entries.tasks.id, "Done"), /Schema.*changed/);
  await assert.rejects(f.api.comment("tasks", f.entries.tasks.id, "Started"), /Schema.*changed/);
  const refreshed = createWorkspace(f.client, { root: f.root, boards: (await f.refresh()).boards });
  await refreshed.comment("tasks", f.entries.tasks.id, "**Started**");
  assert.equal(f.calls.at(-1).payload.markdown, "**Started**");
  f.databases.tasks.title[0].plain_text = "Renamed board";
  await assert.rejects(refreshed.create("tasks", "New"), /moved or changed/);
  assert.equal(f.calls.filter(call => call.kind === "create").length, 0);
});

test("valid discussion replies work but comments on child pages are not parent discussions", async () => {
  const f = await fixture();
  const discussion = f.id();
  f.comments.set(f.entries.tasks.id, [{ id: f.id(), discussion_id: discussion }]);
  await f.api.comment("tasks", f.entries.tasks.id, "**Reply**", discussion);
  assert.equal(f.calls.at(-1).payload.discussion_id, discussion);
  const child = f.page("Child", { type: "page_id", page_id: f.entries.tasks.id });
  const childDiscussion = f.id();
  f.comments.set(child.id, [{ id: f.id(), discussion_id: childDiscussion }]);
  await assert.rejects(f.api.comment("tasks", f.entries.tasks.id, "Reply", childDiscussion), /does not belong/);
});

test("a linked external database does not become a root descendant", async () => {
  const f = await fixture();
  f.databases.features.parent = { type: "page_id", page_id: f.outsider.id };
  await assert.rejects(discover(f.client, f.root), /outside/);
  // Genuine linked views are represented by link_to_page; discovery never follows them.
  const businessBlocks = f.children.get(f.business.id);
  businessBlocks.splice(businessBlocks.findIndex(block => block.id === f.databases.features.id), 1);
  businessBlocks.push({ type: "link_to_page", link_to_page: { database_id: f.databases.features.id } });
  assert.match((await f.refresh()).boards.features.unavailable, /Missing/);
});

test("no unambiguous initial status means --status is required, also for moves", async () => {
  const f = await fixture();
  f.sources.tasks.properties.Status.status.groups[0].option_ids.push("1");
  const m = await f.refresh();
  const api = createWorkspace(f.client, { root: f.root, boards: m.boards });
  await assert.rejects(api.create("tasks", "New"), /pass --status/);
  await api.create("tasks", "New", { status: "In progress" });
  await assert.rejects(api.move("issues", f.entries.issues.id, "tasks"), /pass --status/);
  await api.move("issues", f.entries.issues.id, "tasks", "Done");
});

test("all direct IDs, discussions, relations and move targets stay inside root", async () => {
  const f = await fixture();
  await assert.rejects(f.api.page(f.outsider.id), /outside the configured root/);
  await assert.rejects(f.api.previewEdit(f.outsider.id, { mode: "append", markdown: "x" }), /outside/);
  await assert.rejects(f.api.show("tasks", f.outsider.id), /outside/);
  await assert.rejects(f.api.comment("tasks", f.outsider.id, "x"), /outside/);
  await assert.rejects(f.api.comment("tasks", f.entries.tasks.id, "x", f.id()), /Discussion does not belong/);
  await assert.rejects(f.api.create("tasks", "New", { "blocked-by": [f.outsider.id] }), /outside/);
  await assert.rejects(f.api.create("tasks", "New", { "blocked-by": [f.entries.issues.id] }), /not on tasks/);
  f.databases.issues.parent = { type: "page_id", page_id: f.outsider.id };
  await assert.rejects(f.api.move("tasks", f.entries.tasks.id, "issues"), /outside/);
  await assert.rejects(f.api.list("issues"), /outside/);
  assert.equal(f.calls.filter(call => ["create", "comment", "update", "edit", "move"].includes(call.kind)).length, 0);
});

test("tree and title lookup exclude other roots, include rows, trim titles and reject ambiguity", async () => {
  const f = await fixture();
  f.client.search = async () => { throw new Error("Page indexing must not use global search"); };
  const nested = f.page("Nested document", { type: "page_id", page_id: f.entries.documents.id });
  const tree = await f.api.tree();
  assert.match(tree, /^- Workspace/);
  assert.match(tree, /Tasks Tracker \[database\]/);
  assert.doesNotMatch(tree, /Outside|example/);
  assert.match(await f.api.tree({ rows: true }), /Example \[row\]/);
  const queriesBeforePageReads = f.calls.filter(call => call.kind === "query").length;
  assert.equal((await f.api.page("Business/Partnerships")).id, f.partnership.id);
  assert.equal((await f.api.page("Workspace/Legal")).id, f.legal.id);
  assert.equal(f.calls.filter(call => call.kind === "query").length, queriesBeforePageReads,
    "ordinary page paths must not load database rows");
  const beforeQualifiedRead = f.calls.length;
  assert.equal((await f.api.page("Tasks Tracker/Example")).id, f.entries.tasks.id);
  assert.deepEqual(f.calls.slice(beforeQualifiedRead).filter(call => call.kind === "query").map(call => call.payload.data_source_id), [f.sources.tasks.id]);
  assert.equal((await f.api.page("Document Hub/Example/Nested document")).id, nested.id);
  await assert.rejects(f.api.page("Partnerships"), /ambiguous/);
  await assert.rejects(f.api.page("Outside"), /No accessible page/);
  await assert.rejects(f.api.page("Tasks Tracker"), /is a database/);
});

test("Markdown validation, property validation and board access rules preserved", async () => {
  const f = await fixture();
  assert.throws(() => validateMarkdown(" "), /empty/);
  assert.throws(() => validateMarkdown("x".repeat(600_000)), /exceeds/);
  assert.throws(() => buildProperties("tasks", { priority: "Urgent" }, f.manifest.boards), /Invalid --priority/);
  await assert.rejects(f.api.create("decisions", "D"), /Markdown/);
  await f.api.create("decisions", "D", { markdown: "# Why", category: ["Planning"] });
  await assert.rejects(f.api.comment("features", f.entries.features.id, "hi"), /read-only/);
  await assert.rejects(f.api.status("features", f.entries.features.id, "Open"), /read-only/);
  await assert.rejects(f.api.status("roadmap", f.entries.roadmap.id, "Planned"), /approval/);
  await assert.rejects(f.api.comment("roadmap", f.entries.roadmap.id, "hi"), /approval/);
  await f.api.status("roadmap", f.entries.roadmap.id, "Planned", true);
  await f.api.comment("roadmap", f.entries.roadmap.id, "hi", undefined, true);
  await assert.rejects(f.api.move("tasks", f.entries.tasks.id, "roadmap"), /only allowed/);
  await f.api.create("tasks", "T", { "blocked-by": [f.entries.tasks.id], effort: "Small" });
});

test("discovered options with colliding emoji-free names require an exact value", async () => {
  const f = await fixture();
  f.sources.tasks.properties["Task type"].multi_select.options.push({ name: "🐛 Bug" });
  const manifest = await f.refresh();
  assert.throws(() => buildProperties("tasks", { type: "Bug" }, manifest.boards), /Ambiguous/);
  assert.deepEqual(buildProperties("tasks", { type: "🐛 Bug" }, manifest.boards).properties["Task type"].multi_select, [{ name: "🐛 Bug" }]);
});

test("board move maps compatible fields and reports incompatible values", async () => {
  const f = await fixture();
  f.entries.tasks.properties["Task type"] = { type: "multi_select", multi_select: [{ name: "🐞 Bug" }, { name: "💅 Polish" }] };
  f.entries.tasks.properties["Effort level"] = { type: "select", select: { name: "Small" } };
  const moved = await f.api.move("tasks", f.entries.tasks.id, "issues");
  assert.equal(moved.status, "Backlog");
  assert.deepEqual(moved.dropped.map(entry => entry.field), ["Task type", "Effort level"]);
  assert.equal(f.calls.find(call => call.kind === "move").payload.parent.data_source_id, f.sources.issues.id);
});

test("edits retain preview/approval tokens, reject stale input, and protect child pages", async () => {
  const f = await fixture();
  const edit = { mode: "find", find: "Hello world.", markdown: "Hello **Notion**." };
  const preview = await f.api.previewEdit("Legal", edit);
  assert.deepEqual(preview.diff.filter(line => !line.startsWith("  ")), ["- Hello world.", "+ Hello **Notion**."]);
  await assert.rejects(f.api.edit("Legal", edit, "wrong"), /Approval does not match/);
  await f.api.edit("Legal", edit, preview.approve);
  assert.equal(f.calls.find(call => call.kind === "edit").payload.page_id, f.legal.id);
  f.body.set(f.legal.id, "Hello world.\nChanged");
  await assert.rejects(f.api.edit("Legal", edit, preview.approve), /page changed/);
  f.body.set(f.legal.id, '<page url="u">Child</page>');
  const replace = { mode: "replace", markdown: "# New" };
  const p = await f.api.previewEdit(f.legal.id, replace);
  assert.match(p.warnings.join(" "), /child pages/);
  await f.api.edit(f.legal.id, replace, p.approve);
  assert.equal(f.calls.at(-1).payload.replace_content.allow_deleting_content, undefined);
  const append = { mode: "append", markdown: "## More" };
  await f.api.edit(f.legal.id, append, (await f.api.previewEdit(f.legal.id, append)).approve);
  assert.equal(f.calls.at(-1).payload.insert_content.position.type, "end");
  f.body.set(f.legal.id, "x\nx");
  await assert.rejects(f.api.previewEdit(f.legal.id, { mode: "find", find: "x", markdown: "y" }), /occurs 2 times/);
});

test("root ancestry cycles and inaccessible targets are refused", async () => {
  const f = await fixture();
  f.outsider.parent = { type: "page_id", page_id: f.outsider.id };
  await assert.rejects(assertInRoot(f.client, f.root, f.outsider.id), /outside/);
  await assert.rejects(f.api.page(f.id()), /Inaccessible/);
});

test("comments paginate and sync detects edits without replaying own posts", async () => {
  const f = await fixture();
  let calls = 0;
  f.client.comments.list = async () => ++calls === 1
    ? { results: [], has_more: true, next_cursor: "next" }
    : { results: [{ id: "c", discussion_id: "d", rich_text: [], created_time: "t" }], has_more: false };
  assert.equal((await f.api.show("tasks", f.entries.tasks.id)).comments.length, 1);
  const human = { id: "1", created_time: "2026-09-27", last_edited_time: "2026-09-28", created_by: { id: "human" }, rich_text: [{ plain_text: "Edited" }] };
  const posted = { ...human, id: "2" };
  const { incoming, nextSeen } = newHumanComments([human, posted], "bot", ["1:2026-09-27"], ["2"]);
  assert.deepEqual(incoming.map(item => item.text), ["Edited"]);
  assert.deepEqual(newHumanComments([human, posted], "bot", nextSeen, ["2"]).incoming, []);
  assert.deepEqual(lineDiff("a\nb", "a\nB"), ["  a", "- b", "+ B"]);
});

test("rate limits retry but forbidden requests fail explicitly", async () => {
  const f = await fixture();
  let calls = 0;
  f.client.dataSources.query = async () => {
    if (++calls === 1) throw Object.assign(new Error("limited"), { status: 429, headers: { "retry-after": "0" } });
    return { results: [], has_more: false };
  };
  await f.api.list("tasks");
  assert.equal(calls, 2);
  f.client.dataSources.query = async () => { throw new Error("forbidden"); };
  await assert.rejects(f.api.list("tasks"), /forbidden/);
});

test("agent profile switching leaves Notion credentials and sync checkpoints unchanged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "notion-toolkit-boundary-"));
  try {
    const config = "NOTION_TOKEN=test-placeholder\nNOTION_ROOT_PAGE=Test root\n";
    const state = '{"test-root":{"posted":["comment-id"]}}\n';
    await writeFile(join(dir, ".env.private"), config);
    await writeFile(join(dir, ".notion-sync-state.json"), state);
    await activate("app", [], dir, []);
    await activate("public-site", ["gsap"], dir, []);
    assert.equal(await readFile(join(dir, ".env.private"), "utf8"), config);
    assert.equal(await readFile(join(dir, ".notion-sync-state.json"), "utf8"), state);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
