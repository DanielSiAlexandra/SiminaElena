const priority = { name: "Priority", type: "select" };
const category = { name: "Category", type: "multi_select" };
const issueProps = { priority, type: { name: "Type", type: "multi_select" } };

// Roles and CLI field names are the contract; IDs and option values come from discovery.
export const boards = Object.freeze({
  tasks: {
    path: "Development/Tasks Tracker", access: "work", status: "Status",
    props: {
      priority,
      type: { name: "Task type", type: "multi_select" },
      effort: { name: "Effort level", type: "select" },
      description: { name: "Description", type: "rich_text" },
      "blocked-by": { name: "Blocked by", type: "relation", board: "tasks" }
    },
    readOnly: ["Blocking"]
  },
  issues: { path: "Development/Issue Tracking", access: "work", status: "Status", props: issueProps },
  failures: { path: "Development/Pipeline failures", access: "work", status: "Status", props: issueProps },
  decisions: { path: "Development/Decision Register", access: "content", props: { category } },
  documents: { path: "Development/Document Hub", access: "content", props: { category } },
  features: {
    path: "Business/Feature Requests", access: "read", status: "Status",
    props: { priority, area: { name: "Product area", type: "multi_select" }, effort: { name: "Estimated effort", type: "select" } }
  },
  roadmap: { path: "Business/Product Roadmap", access: "approval", status: "Status", props: {} }
});

export const WORK_BOARDS = Object.freeze(Object.keys(boards).filter(name => boards[name].access === "work"));

export function boardFor(name, configured = boards) {
  if (!Object.hasOwn(boards, name)) throw new Error(`Unknown board: ${name}. Choose ${Object.keys(boards).join(", ")}`);
  const board = configured[name];
  if (!board || board.unavailable) throw new Error(`Board ${name} unavailable: ${board?.unavailable ?? "not discovered"}. Run discover.`);
  return board;
}

export function fieldsOf(board) {
  return [board.title, ...(board.statuses ? ["Status"] : []), ...Object.values(board.props).map(prop => prop.name), ...(board.readOnly ?? [])];
}
