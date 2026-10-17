import { boards } from "./boards.mjs";
import { discover, resolveRoot } from "./discovery.mjs";
import { createWorkspace } from "./notion.mjs";

// Distinct synthetic workspaces exercise discovery without embedding production IDs.
export async function fixture(seed = 1) {
  let counter = seed * 1000;
  const id = () => (++counter).toString(16).padStart(32, "0");
  const objects = new Map();
  const children = new Map();
  const calls = [];
  const comments = new Map();
  const body = new Map();
  const rich = content => [{ plain_text: content, text: { content } }];
  const page = (name, parent) => {
    const object = { object: "page", id: id(), parent, url: "https://notion.so/test",
      properties: { Name: { type: "title", title: rich(name) } } };
    objects.set(object.id, object);
    children.set(object.id, []);
    if (parent.type === "page_id") {
      const list = children.get(parent.page_id) ?? [];
      list.push({ id: object.id, type: "child_page", child_page: { title: name }, has_children: true });
      children.set(parent.page_id, list);
    }
    return object;
  };
  const rootPage = page("Workspace", { type: "workspace", workspace: true });
  const development = page("Development", { type: "page_id", page_id: rootPage.id });
  const business = page("Business", { type: "page_id", page_id: rootPage.id });
  const legal = page("Legal", { type: "page_id", page_id: rootPage.id });
  const partnership = page("Partnerships ", { type: "page_id", page_id: business.id });
  const personal = page("Personal", { type: "page_id", page_id: rootPage.id });
  const partnership2 = page("Partnerships", { type: "page_id", page_id: personal.id });
  const outsider = page("Outside", { type: "workspace", workspace: true });
  const sources = {};
  const databases = {};
  const entries = {};
  for (const [name, role] of Object.entries(boards)) {
    const database = { object: "database", id: id(), title: rich(role.path.split("/").at(-1)),
      parent: { type: "page_id", page_id: role.path.startsWith("Development") ? development.id : business.id }, data_sources: [] };
    const source = { object: "data_source", id: id(), parent: { type: "database_id", database_id: database.id },
      properties: { "Live title": { type: "title" } } };
    if (role.status) {
      const statuses = name === "tasks" ? ["Not started", "In progress", "Done"]
        : name === "roadmap" ? ["Backlog", "Planned"]
          : ["Backlog", "Open", "In progress", "In review", "Resolved"];
      source.properties.Status = { type: "status", status: {
        options: statuses.map((label, i) => ({ id: `${i}`, name: label })),
        groups: [{ name: "To-do", option_ids: ["0"] }]
      } };
    }
    for (const prop of Object.values(role.props)) {
      source.properties[prop.name] = { type: prop.type, [prop.type]:
        prop.type === "select" || prop.type === "multi_select" ? { options:
          (prop.name === "Task type" ? ["🐞 Bug", "💅 Polish"] : prop.name === "Type" ? ["Bug", "Feature request"]
            : prop.name === "Priority" ? ["High", "Low"] : prop.name === "Category" ? ["Planning", "Proposal"]
              : ["Small", "Large"]).map(label => ({ name: label })) }
          : prop.type === "relation" ? { data_source_id: source.id } : {} };
    }
    if (role.readOnly) source.properties.Blocking = { type: "relation", relation: { data_source_id: source.id } };
    database.data_sources.push({ id: source.id });
    objects.set(source.id, source);
    objects.set(database.id, database);
    children.get(database.parent.page_id).push({ id: database.id, type: "child_database", child_database: { title: name } });
    sources[name] = source;
    databases[name] = database;
    const entry = page(`${name} example`, { type: "data_source_id", data_source_id: source.id });
    entry.properties = { "Live title": { type: "title", title: rich("Example") },
      ...(role.status ? { Status: { type: "status", status: { name: source.properties.Status.status.options[0].name } } } : {}) };
    entries[name] = entry;
  }
  const get = key => {
    const result = objects.get(key.replaceAll("-", "").toLowerCase());
    if (!result) throw Object.assign(new Error(`Inaccessible ${key}`), { status: 404, code: "object_not_found" });
    return result;
  };
  const client = {
    pages: {
      retrieve: async ({ page_id }) => get(page_id),
      retrieveMarkdown: async ({ page_id }) => ({ markdown: body.get(page_id) ?? "# Body\nHello world.", truncated: false, unknown_block_ids: [] }),
      create: async payload => { calls.push({ kind: "create", payload }); return { id: id() }; },
      update: async payload => { calls.push({ kind: "update", payload }); return { id: payload.page_id }; },
      move: async payload => { calls.push({ kind: "move", payload }); return { id: payload.page_id }; },
      updateMarkdown: async payload => { calls.push({ kind: "edit", payload }); return {}; }
    },
    databases: { retrieve: async ({ database_id }) => get(database_id) },
    dataSources: {
      retrieve: async ({ data_source_id }) => get(data_source_id),
      query: async payload => { calls.push({ kind: "query", payload }); return {
        results: Object.values(entries).filter(entry => entry.parent.data_source_id === payload.data_source_id), next_cursor: null, has_more: false
      }; }
    },
    blocks: {
      children: { list: async ({ block_id }) => ({ results: children.get(block_id) ?? [], has_more: false }) },
      retrieve: async ({ block_id }) => get(block_id)
    },
    comments: {
      list: async ({ block_id }) => ({ results: comments.get(block_id) ?? [], has_more: false }),
      create: async payload => { calls.push({ kind: "comment", payload }); return { id: id() }; }
    },
    search: async () => ({ results: [...objects.values()].filter(object => object.object === "page"), has_more: false })
  };
  const root = await resolveRoot(client, rootPage.id);
  const refresh = () => discover(client, root);
  const manifest = await refresh();
  const api = createWorkspace(client, { root, boards: manifest.boards });
  return { client, root, rootPage, development, business, legal, partnership, partnership2, personal, outsider,
    objects, children, sources, databases, entries, calls, comments, body, api, manifest, refresh, page, id };
}
