import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boards } from "./boards.mjs";
import { paginate, request } from "./api.mjs";

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const norm = id => id.replaceAll("-", "").toLowerCase();
const text = items => (items ?? []).map(item => item.plain_text ?? item.text?.content ?? "").join("");
const title = page => text(Object.values(page.properties ?? {}).find(prop => prop.type === "title")?.title).trim();
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const manifestVersion = 1;

export async function resolveRoot(client, input) {
  if (!input?.trim()) throw new Error("NOTION_ROOT_PAGE is required (page name, UUID or Notion URL)");
  input = input.trim();
  let id;
  if (UUID.test(input)) id = norm(input);
  else if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (!["notion.so", "notion.site", "notion.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error("Root URL must be a Notion page URL");
    }
    const match = url.pathname.match(/([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i);
    if (!match) throw new Error("Root URL must contain a page UUID in its path, not a view ID");
    id = norm(match[1]);
  } else {
    const results = await paginate((cursor, page_size) => client.search({
      query: input, filter: { value: "page", property: "object" }, start_cursor: cursor, page_size
    }), 5000);
    const matches = results.filter(page => !page.in_trash && !page.archived && sameName(title(page), input));
    if (matches.length !== 1) {
      throw new Error(matches.length
        ? `Root name "${input}" is ambiguous; use a UUID or URL:\n${matches.map(page => `${title(page)} (${page.id}) ${page.url ?? ""}`).join("\n")}`
        : `No accessible root page named "${input}". Check the name and integration access.`);
    }
    id = norm(matches[0].id);
  }
  const page = await request(() => client.pages.retrieve({ page_id: id }));
  if (page.object !== "page" || page.in_trash || page.archived) throw new Error("Configured root is not an active accessible page");
  return { id: norm(page.id), title: title(page), url: page.url };
}

// Follow actual ownership, never links/mentions or linked database views.
export async function assertInRoot(client, root, pageId, type = "page_id") {
  let current = { type, [type]: pageId };
  const seen = new Set();
  for (let depth = 0; depth < 100; depth++) {
    const type = current?.type;
    const id = current?.[type];
    if (!id || type === "workspace") break;
    if (type === "page_id" && norm(id) === root.id) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) break;
    seen.add(key);
    let object;
    if (type === "page_id") object = await request(() => client.pages.retrieve({ page_id: id }));
    else if (type === "database_id") object = await request(() => client.databases.retrieve({ database_id: id }));
    else if (type === "data_source_id") object = await request(() => client.dataSources.retrieve({ data_source_id: id }));
    else if (type === "block_id") object = await request(() => client.blocks.retrieve({ block_id: id }));
    else break;
    if (object.in_trash || object.archived) throw new Error(`Target ${pageId} is archived or trashed`);
    current = object.parent;
  }
  throw new Error(`Target ${pageId} is outside the configured root or its ancestry cannot be verified`);
}

export async function structure(client, root) {
  const nodes = [{ id: root.id, title: root.title, url: root.url, kind: "page", parent: null, path: "" }];
  const seen = new Set();
  async function visit(blockId, owner, path) {
    if (seen.has(norm(blockId))) return;
    seen.add(norm(blockId));
    if (seen.size > 5000) throw new Error("Root structure exceeds 5000 blocks");
    const children = await paginate((cursor, page_size) => client.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size }));
    for (const block of children) {
      if (block.in_trash || block.archived) continue;
      if (block.type === "child_page") {
        const name = block.child_page.title.trim();
        const childPath = [...path, name];
        await assertInRoot(client, root, block.id);
        nodes.push({ id: block.id, title: name, url: `https://www.notion.so/${norm(block.id)}`, kind: "page",
          parent: norm(owner), path: childPath.join("/") });
        await visit(block.id, block.id, childPath);
      } else if (block.type === "child_database") {
        const database = await request(() => client.databases.retrieve({ database_id: block.id }));
        // Check actual database ownership rather than trusting a view/block.
        await assertInRoot(client, root, database.id, "database_id");
        const name = text(database.title).trim();
        nodes.push({ id: database.id, title: name, url: database.url, kind: "database", parent: norm(owner),
          path: [...path, name].join("/"), sources: database.data_sources ?? [] });
      } else if (block.has_children && block.type !== "synced_block") {
        await visit(block.id, owner, path);
      }
    }
  }
  await visit(root.id, root.id, []);
  return nodes;
}

function boardSchema(role, source, database) {
  const properties = source.properties ?? {};
  const titles = Object.entries(properties).filter(([, prop]) => prop.type === "title");
  if (titles.length !== 1) throw new Error("Expected exactly one title property");
  if (role.status && properties[role.status]?.type !== "status") throw new Error(`Required ${role.status} status property missing or wrong type`);
  const status = properties[role.status]?.status;
  const starts = status?.groups?.filter(group => group.name.toLowerCase() === "to-do") ?? [];
  const startIds = starts.flatMap(group => group.option_ids);
  const options = status?.options ?? [];
  const props = {};
  const disabled = {};
  for (const [key, prop] of Object.entries(role.props)) {
    const actual = properties[prop.name];
    if (!actual) { disabled[key] = `${prop.name} is missing`; continue; }
    if (actual.type !== prop.type) { disabled[key] = `${prop.name} has type ${actual.type}, expected ${prop.type}`; continue; }
    props[key] = { ...prop, ...(prop.type === "select" || prop.type === "multi_select"
      ? { options: actual[prop.type].options.map(option => option.name) } : {}) };
    if (prop.type === "relation") props[key].source = actual.relation.data_source_id;
  }
  return { ...role, database, source: source.id, title: titles[0][0], props, disabled,
    readOnly: (role.readOnly ?? []).filter(name => properties[name]?.type === "relation"),
    ...(role.status ? { statuses: options.map(option => option.name),
      defaultStatus: startIds.length === 1 ? options.find(option => option.id === startIds[0])?.name : undefined } : {}) };
}

export async function discover(client, root) {
  const nodes = await structure(client, root);
  const configured = {};
  for (const [name, role] of Object.entries(boards)) {
    const matches = nodes.filter(node => node.kind === "database" && sameName(node.path, role.path));
    if (matches.length !== 1) {
      configured[name] = { ...role, unavailable: matches.length ? `Ambiguous path ${role.path}: ${matches.map(node => node.id).join(", ")}` : `Missing ${role.path}` };
      continue;
    }
    const database = matches[0];
    const candidates = [];
    const reasons = [];
    for (const source of database.sources) {
      const schema = await request(() => client.dataSources.retrieve({ data_source_id: source.id }));
      try { candidates.push(boardSchema(role, schema, database.id)); }
      catch (error) { reasons.push(`${source.id}: ${error.message}`); }
    }
    configured[name] = candidates.length === 1 ? candidates[0] : { ...role,
      unavailable: candidates.length > 1 ? `Ambiguous data sources in ${database.id}: ${candidates.map(candidate => candidate.source).join(", ")}` : `No compatible source in ${database.id}: ${reasons.join("; ")}` };
  }
  const tasks = configured.tasks?.unavailable ? undefined : configured.tasks;
  const relation = tasks?.props?.["blocked-by"];
  if (relation && (!relation.source || norm(relation.source) !== norm(tasks.source))) {
    delete tasks.props["blocked-by"];
    tasks.disabled["blocked-by"] = "Blocked by must relate to the discovered Tasks data source";
  }
  if (tasks?.readOnly?.includes("Blocking")) {
    const schema = await request(() => client.dataSources.retrieve({ data_source_id: tasks.source }));
    if (norm(schema.properties.Blocking.relation.data_source_id ?? "") !== norm(tasks.source)) tasks.readOnly = [];
  }
  return { version: manifestVersion, root, discoveredAt: new Date().toISOString(), boards: configured, nodes };
}

export async function saveManifest(directory, manifest) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${manifest.root.id}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}

export async function loadManifest(directory, root) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(directory, `${root.id}.json`), "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`No discovery manifest for "${root.title}". Run discover.`);
    if (error instanceof SyntaxError) throw new Error("Invalid discovery manifest JSON. Run discover.");
    throw error;
  }
  if (manifest.version !== manifestVersion || manifest.root?.id !== root.id || !manifest.boards || !Array.isArray(manifest.nodes)) {
    throw new Error("Invalid or outdated discovery manifest. Run discover.");
  }
  // Access policy is code-owned, never supplied by a local cache.
  for (const [name, role] of Object.entries(boards)) {
    if (manifest.boards[name]) manifest.boards[name].access = role.access;
  }
  return manifest;
}

export async function validateBoard(client, root, name, cached) {
  const role = boards[name];
  // Refresh the role path as well as schema, so moved/replaced databases cannot receive stale writes.
  const nodes = await structure(client, root);
  const matches = nodes.filter(node => node.kind === "database" && sameName(node.path, role.path));
  if (matches.length !== 1 || norm(matches[0].id) !== norm(cached.database) ||
      !matches[0].sources.some(source => norm(source.id) === norm(cached.source))) throw new Error(`Board ${name} moved or changed. Run discover.`);
  const schema = await request(() => client.dataSources.retrieve({ data_source_id: cached.source }));
  const fresh = boardSchema(role, schema, cached.database);
  // Relation validation is applied consistently with discovery.
  if (fresh.props["blocked-by"] && norm(fresh.props["blocked-by"].source ?? "") !== norm(fresh.source)) {
    delete fresh.props["blocked-by"];
    fresh.disabled["blocked-by"] = "Blocked by must relate to the discovered Tasks data source";
  }
  if (fresh.readOnly.includes("Blocking") && norm(schema.properties.Blocking.relation.data_source_id ?? "") !== norm(fresh.source)) fresh.readOnly = [];
  if (JSON.stringify(fresh) !== JSON.stringify(cached)) throw new Error(`Schema for ${name} changed. Run discover.`);
}
