const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function request(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (error?.status !== 429 || attempt >= 4) throw error;
      const raw = error.headers?.get?.("retry-after") ?? error.headers?.["retry-after"];
      const parsed = Number(raw);
      await sleep(Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed * 1000, 30000) : 1000 * (attempt + 1));
    }
  }
}

export async function paginate(operation, max = 500) {
  let cursor;
  const items = [];
  do {
    const result = await request(() => operation(cursor, Math.max(1, Math.min(100, max + 1 - items.length))));
    if (result.request_status?.type === "incomplete") throw new Error("Notion query is incomplete; narrow the selection");
    items.push(...result.results);
    if (items.length > max) throw new Error(`Content exceeds ${max} entries; narrow the selection`);
    cursor = result.has_more ? result.next_cursor : undefined;
    if (result.has_more && !cursor) throw new Error("Notion pagination returned no cursor");
  } while (cursor);
  return items;
}
