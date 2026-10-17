import { createHash } from "node:crypto";
import { boardFor, fieldsOf, WORK_BOARDS } from "./boards.mjs";
import { paginate, request } from "./api.mjs";
import { assertInRoot, structure, validateBoard } from "./discovery.mjs";

const PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const MAX_BLOCKS = 500;
const MAX_INDEX_NODES = 5000;
const MAX_UNKNOWN = 50;
export const MAX_MARKDOWN_BYTES = 500_000;
const MAX_COMMENT = 2000;

export const normalizeId = id => id.replaceAll("-", "").toLowerCase();

export function validatePageId(id) {
  if (!PAGE_ID.test(id ?? "")) throw new Error(`Expected a Notion page ID (UUID), got: ${id}`);
  return normalizeId(id);
}

export function validateMarkdown(markdown, maxChars) {
  if (typeof markdown !== "string" || !markdown.trim()) throw new Error("Markdown content must not be empty");
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) throw new Error(`Markdown exceeds ${MAX_MARKDOWN_BYTES} bytes; split it into several pages`);
  if (maxChars && markdown.length > maxChars) throw new Error(`Markdown must be at most ${maxChars} characters here`);
  return markdown;
}

function validateTitle(title) {
  if (typeof title !== "string" || !title.trim() || title.length > 200) throw new Error("Title must contain 1-200 characters");
  return title.trim();
}

// Comments posted with a personal access token are attributed to the user, so our own posts are tracked locally.
export function newHumanComments(comments, botId, seen = [], posted = []) {
  const known = new Set(seen);
  const ours = new Set(posted);
  const version = comment => `${comment.id}:${comment.last_edited_time ?? comment.created_time}`;
  const incoming = comments
    .filter(comment => !known.has(version(comment)) && !ours.has(comment.id) && comment.created_by?.id !== botId)
    .sort((a, b) => a.created_time.localeCompare(b.created_time))
    .map(comment => ({
      id: comment.id, discussion_id: comment.discussion_id, created_time: comment.created_time,
      author: comment.created_by?.id, text: richText(comment.rich_text)
    }));
  return { incoming, nextSeen: comments.map(version) };
}

function richText(items = []) {
  return items.map(item => item.plain_text ?? item.text?.content ?? "").join("");
}

function value(property) {
  if (!property) return null;
  switch (property.type) {
    case "title":
    case "rich_text": return richText(property[property.type]);
    case "status":
    case "select": return property[property.type]?.name ?? null;
    case "multi_select": return property.multi_select.map(item => item.name);
    case "relation": return property.relation.map(item => item.id);
    case "people": return property.people.map(person => person.name ?? person.id);
    case "files": return property.files.map(file => file.name);
    case "date": return property.date;
    case "number":
    case "checkbox":
    case "url":
    case "email":
    case "created_time":
    case "last_edited_time": return property[property.type];
    default: return null;
  }
}

const isEmpty = entry => entry === null || entry === "" || (Array.isArray(entry) && entry.length === 0);

function titleOf(page) {
  const property = Object.values(page.properties ?? {}).find(entry => entry.type === "title");
  return property ? richText(property.title).trim() : "";
}

function summarize(page, board) {
  return {
    id: page.id,
    title: value(page.properties[board.title]),
    status: value(page.properties.Status),
    url: page.url,
    properties: Object.fromEntries(fieldsOf(board).filter(field => field !== board.title && field !== "Status")
      .map(field => [field, value(page.properties[field])]).filter(([, entry]) => entry !== null))
  };
}

const normalizeOption = option => option.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();

function pickOption(prop, raw, flag) {
  if (prop.options.includes(raw)) return raw;
  const matches = prop.options.filter(option => normalizeOption(option) === normalizeOption(raw));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Ambiguous ${flag}: ${raw}. Use an exact value: ${matches.join(", ")}`);
  throw new Error(`Invalid ${flag}: ${raw}. Choose ${prop.options.join(", ")}`);
}

export function buildProperties(name, fields = {}, configured) {
  const board = boardFor(name, configured);
  const properties = {};
  const relations = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined) continue;
    if (key === "status") {
      if (!board.statuses?.includes(raw)) throw new Error(`Invalid status for ${name}: ${raw}. Choose ${board.statuses?.join(", ") ?? "none"}`);
      properties.Status = { status: { name: raw } };
      continue;
    }
    const prop = board.props[key];
    if (!prop) throw new Error(`--${key} is not supported on ${name}${board.disabled?.[key] ? `: ${board.disabled[key]}` : ""}`);
    const list = [raw].flat().flatMap(item => String(item).split(",")).map(item => item.trim()).filter(Boolean);
    switch (prop.type) {
      case "select":
        if (list.length !== 1) throw new Error(`--${key} takes one value`);
        properties[prop.name] = { select: { name: pickOption(prop, list[0], `--${key}`) } };
        break;
      case "multi_select":
        properties[prop.name] = { multi_select: [...new Set(list.map(item => pickOption(prop, item, `--${key}`)))].map(option => ({ name: option })) };
        break;
      case "rich_text":
        if (typeof raw !== "string" || raw.length > 2000) throw new Error(`--${key} must be text of at most 2000 characters`);
        properties[prop.name] = { rich_text: [{ text: { content: raw } }] };
        break;
      case "relation": {
        const ids = [...new Set(list.map(validatePageId))];
        relations.push({ board: prop.board, ids });
        properties[prop.name] = { relation: ids.map(id => ({ id })) };
        break;
      }
      default:
        throw new Error(`Unsupported property type ${prop.type}`);
    }
  }
  return { properties, relations };
}

const MAX_DIFF_LINES = 3000;

export function lineDiff(before, after, context = 2) {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return [`(too large to diff: ${a.length} -> ${b.length} lines)`];
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push(["  ", a[i]]); i++; j++; }
    else if (i < a.length && (j === b.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) ops.push(["- ", a[i++]]);
    else ops.push(["+ ", b[j++]]);
  }
  const keep = ops.map((op, index) => op[0] !== "  " ||
    ops.slice(Math.max(0, index - context), index + context + 1).some(near => near[0] !== "  "));
  const lines = [];
  ops.forEach((op, index) => {
    if (keep[index]) lines.push(op[0] + op[1]);
    else if (keep[index - 1] !== false || index === 0) lines.push("  …");
  });
  return lines;
}

function countMatches(text, find) {
  let count = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + find.length)) count++;
  return count;
}

function requireAccess(name, board, action, approved) {
  if (board.access === "read") throw new Error(`${name} is read-only`);
  if (board.access === "approval" && !approved) throw new Error(`Roadmap ${action} require explicit approval for this specific change`);
}

export function createWorkspace(client, { root, boards: configured } = {}) {
  if (!root || !configured) throw new Error("A discovered root and board manifest are required. Run discover.");
  const getBoard = name => boardFor(name, configured);
  const scope = async id => {
    if (!root) throw new Error("A discovered root is required");
    await assertInRoot(client, root, id);
  };
  const checkBoard = async name => {
    const board = getBoard(name);
    await validateBoard(client, root, name, board);
  };
  async function pageOnBoard(name, id) {
    const board = getBoard(name);
    await scope(id);
    const page = await request(() => client.pages.retrieve({ page_id: validatePageId(id) }));
    if (page.object !== "page" || normalizeId(page.parent?.data_source_id ?? "") !== normalizeId(board.source)) {
      throw new Error(`Page ${id} is not on ${name}`);
    }
    return { board, page };
  }

  async function pageComments(id) {
    const comments = await paginate((cursor, page_size) => client.comments.list({ block_id: id, start_cursor: cursor, page_size }));
    let seen = 0;
    async function visit(parent) {
      const children = await paginate((cursor, page_size) => client.blocks.children.list({ block_id: parent, start_cursor: cursor, page_size }),
        MAX_BLOCKS - seen);
      for (const block of children) {
        if (++seen > MAX_BLOCKS) throw new Error("Page has too many blocks");
        if (["child_page", "child_database", "synced_block"].includes(block.type)) continue;
        comments.push(...await paginate((cursor, page_size) => client.comments.list({ block_id: block.id, start_cursor: cursor, page_size })));
        if (block.has_children && block.type !== "child_page" && block.type !== "child_database") await visit(block.id);
      }
    }
    await visit(id);
    return comments;
  }

  async function readMarkdown(id) {
    await scope(id);
    const response = await request(() => client.pages.retrieveMarkdown({ page_id: id }));
    let markdown = response.markdown;
    const inaccessible = [];
    const unknown = response.unknown_block_ids ?? [];
    for (const blockId of unknown.slice(0, MAX_UNKNOWN)) {
      try {
        await assertInRoot(client, root, blockId, "block_id");
        markdown += "\n" + (await request(() => client.pages.retrieveMarkdown({ page_id: blockId }))).markdown;
      }
      catch (error) {
        if (error?.status !== 404 && error?.code !== "object_not_found") throw error;
        inaccessible.push(blockId);
      }
    }
    return { markdown, truncated: Boolean(response.truncated) || unknown.length > MAX_UNKNOWN, inaccessible };
  }

  async function verifyRelations(relations) {
    for (const { board, ids } of relations) for (const id of ids) await pageOnBoard(board, id);
  }

  async function index(includeRows = true, segments = []) {
    const nodes = new Map((await structure(client, root)).map(node => [normalizeId(node.id), node]));
    if (!includeRows) return nodes;
    const namedDatabases = [...nodes.values()].filter(node => node.kind === "database" &&
      segments.slice(0, -1).includes(node.title.toLowerCase()));
    const sources = new Set();
    // Query only databases physically under this root, not the token's global search index.
    // Map iteration also visits databases discovered inside row subtrees.
    for (const database of nodes.values()) {
      if (namedDatabases.length && !namedDatabases.some(node => node.id === database.id)) continue;
      for (const source of database.sources ?? []) {
        if (sources.has(normalizeId(source.id))) continue;
        sources.add(normalizeId(source.id));
        await assertInRoot(client, root, source.id, "data_source_id");
        const rows = await paginate((cursor, page_size) => client.dataSources.query({
          data_source_id: source.id, start_cursor: cursor, page_size
        }), MAX_INDEX_NODES);
        for (const row of rows) {
          if (row.in_trash || row.archived) continue;
          await scope(row.id);
          nodes.set(normalizeId(row.id), { id: row.id, title: titleOf(row), kind: "row", parent: normalizeId(database.id), url: row.url });
          const descendants = await structure(client, { id: normalizeId(row.id), title: titleOf(row), url: row.url });
          for (const child of descendants.slice(1)) nodes.set(normalizeId(child.id), child);
          if (nodes.size > MAX_INDEX_NODES) throw new Error(`Root index exceeds ${MAX_INDEX_NODES} entries`);
        }
      }
    }
    return nodes;
  }

  function ancestry(nodes, node) {
    const chain = [];
    const seen = new Set();
    for (let current = node; current && !seen.has(current.id); current = current.parent ? nodes.get(current.parent) : null) {
      seen.add(current.id);
      chain.unshift(current.title);
    }
    return chain;
  }

  async function resolvePath(path) {
    const segments = String(path ?? "").split("/").map(segment => segment.trim().toLowerCase()).filter(Boolean);
    if (!segments.length) throw new Error("Page path must contain a title, e.g. \"Legal\" or \"Business/Partnerships\"");
    let nodes = await index(false);
    const match = node => {
      const chain = ancestry(nodes, node).map(title => title.toLowerCase());
      if (chain.length < segments.length) return false;
      return segments.every((segment, i) => chain[chain.length - segments.length + i] === segment);
    };
    let matches = [...nodes.values()].filter(match);
    if (!matches.length) {
      nodes = await index(true, segments);
      matches = [...nodes.values()].filter(match);
    }
    if (matches.length === 1) return { node: matches[0], path: ancestry(nodes, matches[0]).join("/") };
    if (matches.length > 1) {
      throw new Error(`"${path}" is ambiguous; use a longer path or ID:\n` +
        matches.slice(0, 20).map(node => `  ${ancestry(nodes, node).join("/")} (${node.id})`).join("\n"));
    }
    const last = segments.at(-1);
    const close = [...nodes.values()].filter(node => node.title.toLowerCase().includes(last)).slice(0, 10);
    throw new Error(`No accessible page matches "${path}"` +
      (close.length ? `. Similar:\n${close.map(node => `  ${ancestry(nodes, node).join("/")}`).join("\n")}` : ""));
  }

  async function resolveTarget(target) {
    if (PAGE_ID.test(target ?? "")) {
      await scope(target);
      const page = await request(() => client.pages.retrieve({ page_id: normalizeId(target) }));
      if (page.object !== "page") throw new Error(`${target} is not a page`);
      return { id: page.id, path: titleOf(page) || target, url: page.url };
    }
    const { node, path } = await resolvePath(target);
    if (node.kind === "database") throw new Error(`"${path}" is a database; only pages can be edited`);
    await scope(node.id);
    return { id: node.id, path, url: node.url };
  }

  // The approval token binds the exact page, edit and current content, so a stale or altered edit is refused.
  async function planEdit(target, { mode, markdown, find, all = false }) {
    if (!["replace", "append", "find"].includes(mode)) throw new Error("Choose exactly one edit mode: --replace, --append or --find <text>");
    if (mode === "find") {
      if (typeof find !== "string" || !find) throw new Error("--find needs the exact Markdown text to replace");
      if (typeof markdown !== "string") throw new Error("Replacement Markdown is required (inline, --file, or \"\" to delete)");
      if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) throw new Error(`Markdown exceeds ${MAX_MARKDOWN_BYTES} bytes`);
    } else validateMarkdown(markdown);
    const page = await resolveTarget(target);
    const current = await request(() => client.pages.retrieveMarkdown({ page_id: page.id }));
    const before = current.markdown ?? "";
    const warnings = [];
    if (current.truncated || current.unknown_block_ids?.length) warnings.push("Page has truncated or inaccessible blocks; the preview may be incomplete");
    let after;
    if (mode === "replace") {
      after = markdown;
      if (/<(page|database) /.test(before)) warnings.push("Page has child pages/databases: keep their <page>/<database> lines in the new Markdown, or Notion rejects the edit");
      warnings.push("Comments attached to replaced blocks may be lost");
    } else if (mode === "append") {
      after = before ? `${before}\n${markdown}` : markdown;
    } else {
      const matches = countMatches(before, find);
      if (matches === 0) throw new Error("--find text does not occur in the page's Markdown (see `page` output for the exact text)");
      if (matches > 1 && !all) throw new Error(`--find text occurs ${matches} times; make it unique or pass --all`);
      after = all ? before.split(find).join(markdown) : before.replace(find, () => markdown);
    }
    const token = createHash("sha256").update(JSON.stringify([normalizeId(page.id), mode, find ?? null, Boolean(all), markdown, before]))
      .digest("hex").slice(0, 12);
    return { page, mode, markdown, find, all, token, warnings, diff: lineDiff(before, after) };
  }

  return {
    async previewEdit(target, edit) {
      const plan = await planEdit(target, edit);
      return { id: plan.page.id, path: plan.page.path, url: plan.page.url, mode: plan.mode, applied: false,
        warnings: plan.warnings, diff: plan.diff, approve: plan.token };
    },
    async edit(target, edit, approval) {
      const plan = await planEdit(target, edit);
      if (approval !== plan.token) {
        throw new Error("Approval does not match this edit or the page changed since the preview; preview again and get fresh approval");
      }
      await scope(plan.page.id);
      const body = plan.mode === "replace" ? { type: "replace_content", replace_content: { new_str: plan.markdown } }
        : plan.mode === "append" ? { type: "insert_content", insert_content: { content: plan.markdown, position: { type: "end" } } }
        : { type: "update_content", update_content: { content_updates: [{ old_str: plan.find, new_str: plan.markdown, ...(plan.all ? { replace_all_matches: true } : {}) }] } };
      await request(() => client.pages.updateMarkdown({ page_id: plan.page.id, ...body }));
      return { id: plan.page.id, path: plan.page.path, url: plan.page.url, mode: plan.mode, applied: true };
    },
    async list(name, limit = 20, cursor) {
      const board = getBoard(name);
      await assertInRoot(client, root, board.database, "database_id");
      await assertInRoot(client, root, board.source, "data_source_id");
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be between 1 and 100");
      const response = await request(() => client.dataSources.query({
        data_source_id: board.source,
        page_size: limit,
        ...(cursor ? { start_cursor: cursor } : {}),
        filter_properties: fieldsOf(board)
      }));
      if (response.request_status?.type === "incomplete") throw new Error("Notion query hit the 10,000-result limit; narrow the selection");
      return { items: response.results.map(page => summarize(page, board)), next_cursor: response.next_cursor };
    },
    async show(name, id) {
      const { board, page } = await pageOnBoard(name, id);
      return { ...summarize(page, board), ...await readMarkdown(page.id), comments: (await pageComments(page.id)).map(comment => ({
        id: comment.id, discussion_id: comment.discussion_id, created_time: comment.created_time,
        author: comment.created_by?.id, text: richText(comment.rich_text)
      })) };
    },
    async comments(name, id) {
      const { page } = await pageOnBoard(name, id);
      return pageComments(page.id);
    },
    async me() {
      return request(() => client.users.me({}));
    },
    async comment(name, id, markdown, discussionId, approved = false) {
      const board = getBoard(name);
      requireAccess(name, board, "comments", approved);
      validateMarkdown(markdown, MAX_COMMENT);
      await checkBoard(name);
      const { page } = await pageOnBoard(name, id);
      if (discussionId) {
        const comments = await pageComments(page.id);
        if (!comments.some(comment => normalizeId(comment.discussion_id) === validatePageId(discussionId))) {
          throw new Error("Discussion does not belong to this page or is inaccessible");
        }
      }
      return client.comments.create({
        ...(discussionId ? { discussion_id: validatePageId(discussionId) } : { parent: { page_id: page.id } }),
        markdown: markdown.trim()
      });
    },
    async status(name, id, target, approved = false) {
      const board = getBoard(name);
      if (board.access !== "work") requireAccess(name, board, "status edits", approved);
      if (!board.statuses?.includes(target)) throw new Error(`Invalid status for ${name}: ${target}. Choose ${board.statuses?.join(", ") ?? "none"}`);
      await checkBoard(name);
      const { page } = await pageOnBoard(name, id);
      if (page.properties.Status?.status?.name === target) return { id: page.id, unchanged: true };
      return client.pages.update({ page_id: page.id, properties: { Status: { status: { name: target } } } });
    },
    async create(name, title, { markdown, ...fields } = {}) {
      const board = getBoard(name);
      if (board.access !== "work" && board.access !== "content") throw new Error(`Creating entries on ${name} is not supported`);
      if (board.access === "content" && markdown === undefined) throw new Error(`${name} entries need Markdown content (inline or --file)`);
      if (markdown !== undefined) validateMarkdown(markdown);
      if (board.statuses && fields.status === undefined && !board.defaultStatus) throw new Error(`No unambiguous default status for ${name}; pass --status`);
      const { properties, relations } = buildProperties(name, {
        ...(board.statuses ? { status: board.defaultStatus } : {}),
        ...Object.fromEntries(Object.entries(fields).filter(([, entry]) => entry !== undefined))
      }, configured);
      await checkBoard(name);
      await verifyRelations(relations);
      return client.pages.create({
        parent: { type: "data_source_id", data_source_id: board.source },
        properties: { [board.title]: { title: [{ text: { content: validateTitle(title) } }] }, ...properties },
        ...(markdown !== undefined ? { markdown } : {})
      });
    },
    async move(name, id, targetName, status) {
      if (!WORK_BOARDS.includes(name) || !WORK_BOARDS.includes(targetName)) throw new Error(`Board moves are only allowed between ${WORK_BOARDS.join(", ")}`);
      if (name === targetName) throw new Error("Target board must differ from the source board");
      const target = getBoard(targetName);
      if (status !== undefined && !target.statuses.includes(status)) throw new Error(`Invalid status for ${targetName}: ${status}. Choose ${target.statuses.join(", ")}`);
      const { board, page } = await pageOnBoard(name, id);
      const current = page.properties.Status?.status?.name;
      const nextStatus = status ?? (target.statuses.includes(current) ? current : target.defaultStatus);
      if (!nextStatus) throw new Error(`No unambiguous default status for ${targetName}; pass --status`);
      await checkBoard(name);
      await checkBoard(targetName);
      const properties = {
        [target.title]: { title: [{ text: { content: value(page.properties[board.title]) || "Untitled" } }] },
        Status: { status: { name: nextStatus } }
      };
      const carried = [];
      const dropped = [];
      for (const [key, prop] of Object.entries(board.props)) {
        const entry = value(page.properties[prop.name]);
        if (isEmpty(entry)) continue;
        const destination = target.props[key];
        if (!destination || destination.type !== prop.type || !destination.options) { dropped.push({ field: prop.name, value: entry }); continue; }
        const values = [entry].flat();
        const mapped = values.map(item => {
          if (destination.options.includes(item)) return item;
          const matches = destination.options.filter(option => normalizeOption(option) === normalizeOption(item));
          return matches.length === 1 ? matches[0] : undefined;
        });
        const kept = mapped.filter(Boolean);
        const lost = values.filter((_, i) => !mapped[i]);
        if (kept.length) {
          properties[destination.name] = destination.type === "select" ? { select: { name: kept[0] } } : { multi_select: kept.map(option => ({ name: option })) };
          carried.push(destination.name);
        }
        if (lost.length) dropped.push({ field: prop.name, value: prop.type === "select" ? lost[0] : lost });
      }
      for (const field of board.readOnly ?? []) {
        const entry = value(page.properties[field]);
        if (!isEmpty(entry)) dropped.push({ field, value: entry });
      }
      await request(() => client.pages.move({ page_id: page.id, parent: { type: "data_source_id", data_source_id: target.source } }));
      await request(() => client.pages.update({ page_id: page.id, properties }));
      return { id: page.id, board: targetName, status: nextStatus, carried, dropped };
    },
    async tree({ rows = false } = {}) {
      const nodes = await index(rows);
      const children = new Map();
      for (const node of nodes.values()) {
        if (node.kind === "row" && !rows) continue;
        const key = node.parent ?? "";
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(node);
      }
      const lines = [];
      const seen = new Set();
      function walk(key, depth) {
        for (const node of (children.get(key) ?? []).sort((a, b) => a.title.localeCompare(b.title))) {
          const nodeKey = normalizeId(node.id);
          if (seen.has(nodeKey)) continue;
          seen.add(nodeKey);
          lines.push(`${"  ".repeat(depth)}- ${node.title || "Untitled"}${node.kind === "page" ? "" : ` [${node.kind}]`} ${node.id}`);
          walk(nodeKey, depth + 1);
        }
      }
      walk("", 0);
      return lines.join("\n");
    },
    async page(path) {
      let node, fullPath;
      if (PAGE_ID.test(path ?? "")) {
        const target = await resolveTarget(path);
        node = { id: target.id, url: target.url };
        fullPath = target.path;
      } else {
        ({ node, path: fullPath } = await resolvePath(path));
        if (node.kind === "database") throw new Error(`"${fullPath}" is a database; use \`list <board>\` or \`tree --rows\``);
      }
      const page = await request(() => client.pages.retrieve({ page_id: node.id }));
      const properties = Object.fromEntries(Object.entries(page.properties ?? {})
        .filter(([, property]) => property.type !== "title")
        .map(([key, property]) => [key, value(property)]).filter(([, entry]) => !isEmpty(entry)));
      return { id: node.id, url: node.url, path: fullPath, ...(Object.keys(properties).length ? { properties } : {}), ...await readMarkdown(node.id) };
    }
  };
}
