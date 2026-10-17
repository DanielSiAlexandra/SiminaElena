# Project Handover: AI-Driven Workspace & Task Tracking Architecture

## 📋 Executive Summary
This document serves as the architectural handover for transitioning project management, wiki documentation, and task workflows away from enterprise-scale setups (Jira + Confluence). Given a **one-person engineering team orchestrating autonomous AI agents**, the core objective is to minimize administrative overhead, eliminate token-bloat during API operations, and maximize compatibility with LLM runtime contexts.

**Current CLI integration:** [docs/notion/README.md](docs/notion/README.md) describes root-based discovery for seven supported board roles and the page tree. Configure `NOTION_ROOT_PAGE` by name, UUID or URL and run `discover`; database IDs and schemas are stored in a git-ignored local manifest, not hardcoded. It uses the official SDK and the 2025-09-03 data-source API with Markdown-only content. No LangChain loader, webhook or always-on worker is installed on this branch. The example below is a future blueprint, not code to run against the current boards (their property names and data-source parents differ).

---

## 🔍 Options Considered & Trade-offs

During exploration, three major infrastructure patterns were evaluated against constraints of **unlimited tracking scale**, **dependency management**, and **markdown/Obsidian portability**.

### 1. Jira + Confluence (Legacy Stack)
- **Verdict:** REJECTED
- **Rationale:** Built for corporate compliance and human bureaucracy. The payload returned by Atlassian APIs contains massive enterprise JSON schemas and proprietary document formats (ADF). This layout consumes excessive token context and frequently causes syntax mapping errors with LLM code parsers.

### 2. Markdown Git-Vault Architecture (Quartz + Obsidian + GitHub Pages)
- **Verdict:** STRONG ALTERNATIVE
- **Rationale:** Tasks and docs live natively in the `/docs` folder of your codebase as plain `.md` files. AI interacts using local file-system operations (via tools like Aider/Cline) and pushes to GitHub, where a GitHub Actions workflow deploys to Quartz on GitHub Pages. Completely free and incredibly fast, but shifts structural relational checking entirely into custom system prompt parsing code.

### 3. Unified Read/Write Notion Integration (Chosen Stack)
- **Verdict:** SELECTED APPROACH
- **Rationale:** Offers a completely infinite, uncapped free datastore for a single user. It bridges the gap between structured relational databases (Epics ➔ Tasks ➔ Subtasks with blocking connections) and a rich, tree-nested document system. It cleanly isolates structural schemas while preserving a straightforward export path to Markdown for localized Obsidian environments.

---

## 🛠️ The Selected Blueprint: The Notion Dual-Layer Pipeline

To circumvent heavy payload structures while empowering autonomous agents to run tracking automation loops, the platform splits operation into a **Read Layer** and a **Write Layer**.

Folosește codul cu precauție.[ NOTION WORKSPACE ]▲                │(Write Actions via SDK Client)│                │ (Read Context via LangChain)│                ▼[ Custom Node.js Scripts ] ◄───────┴────── [ LLM Agent (GPT-4o/Claude) ]├── Add Task / Subtask├── Update Workflow State└── Write Decision Logs
### 1. The Read Layer (LangChain Data Ingestion)
The agent reads project status and engineering requirements using the `@notionhq/client` data wrapper packaged inside LangChain's **`NotionAPILoader`**.

* **Token Optimization:** Rather than pulling down every layout configuration element, the loader flattens properties and strips styling data.
* **Context Preservation:** Structural relationships (like **"Blocked By"** relations) are compiled down into highly predictable `metadata` tracking maps that the AI can instantly read to build state charts.

### 2. The Write Layer (Precision JavaScript Execution Tools)
Instead of forcing the LLM to write structural JSON database mutations on its own (which introduces prompt injection bugs and layout errors), you expose hardcoded execution handlers as standard **LangChain Tools** that the AI can trigger via native Function Calling.

---

## 💻 Technical Implementation Framework (Node.js)

Below is the production script architecture deploying the core tool pipeline using the official `@notionhq/client` library.

### Initialization & System Blueprint (`notion-tracker.js`)

```javascript
import { Client } from "@notionhq/client";
import * as dotenv from "dotenv";

dotenv.config();

// Ensure your Notion Token and DB IDs are globally cached in your deployment environment
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID;
const DECISIONS_DB_ID = process.env.NOTION_DECISIONS_DB_ID;

/**
 * Tool 1: Inject a clean task entry into the unified Product Backlog
 */
export async function createTask(title, epicId = null, blockedByArray = []) {
  try {
    const properties = {
      "Name": { title: [{ text: { content: title } }] },
      "Status": { status: { name: "Todo" } }
    };

    if (epicId) {
      properties["Epic"] = { relation: [{ id: epicId }] };
    }

    if (blockedByArray.length > 0) {
      properties["Blocked By"] = { relation: blockedByArray.map(id => ({ id })) };
    }

    const response = await notion.pages.create({
      parent: { database_id: TASKS_DB_ID },
      properties: properties
    });

    console.log(`🚀 Task Created Successfully. Object ID: ${response.id}`);
    return response.id;
  } catch (error) {
    console.error("Failed to append task item:", error);
    throw error;
  }
}

/**
 * Tool 2: Alter status properties (e.g., Todo -> In Progress -> Done)
 */
export async function updateTaskStatus(taskId, targetStatus) {
  try {
    await notion.pages.update({
      page_id: taskId,
      properties: {
        "Status": { status: { name: targetStatus } }
      }
    });
    console.log(`🔄 Task State Shifted: ID ${taskId} is now [${targetStatus}]`);
  } catch (error) {
    console.error("Failed to mutate status layout:", error);
    throw error;
  }
}

/**
 * Tool 3: Populate the Architecture Decision Register (ADR)
 */
export async function writeDecisionRegister(title, reasoningContext, outcomeStatus = "Approved") {
  try {
    await notion.pages.create({
      parent: { database_id: DECISIONS_DB_ID },
      properties: {
        "Decision Title": { title: [{ text: { content: title } }] },
        "Status": { select: { name: outcomeStatus } },
        "Timestamp": { date: { start: new Date().toISOString().split('T')[0] } }
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: [{ text: { content: "Engineering Motivation & Context" } }] }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: reasoningContext } }] }
        }
      ]
    });
    console.log(`📝 Logged engineering decision: "${title}"`);
  } catch (error) {
    console.error("Failed to write to Decision Register:", error);
    throw error;
  }
}
```

---

## 🚦 Operational Constraints & Mitigation Rules

To keep the pipeline robust for single-user AI orchestration, adhere to the following core operational guards:

1. **The 3-RPS Rate Boundary:** The Notion API strictly caps processing loops at **3 Requests Per Second**. When executing bulk subtask operations, your custom worker wrappers must employ a throttle/delay middleware to prevent throwing `429 Too Many Requests` responses.
2. **Stale Cache Mitigation:** Because the `NotionAPILoader` pulls down a snapshot at the *start* of the agent runtime loop, any state changes made by the AI mid-run (like resolving a blocker) must be updated inside the agent's internal working memory array instead of triggering a full database reload.
3. **Clean Markdown Vault Export:** Avoid utilizing intricate multi-column layouts or complex third-party Notion gallery widgets inside text areas. Keep documentation bodies in direct linear header layouts. This guarantees that when you trigger a standard Workspace ZIP export to pull data down into an **Obsidian Local Vault**, the formatting converts perfectly to raw `.md` syntax.
