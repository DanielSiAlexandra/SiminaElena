import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Installed at .agent-toolkit/bootstrap/hooks/bootstrap.mjs, without loading duplicate plugin skills.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const instructions = readFileSync(resolve(repo, ".agent-toolkit/vendor/superpowers/skills/using-superpowers/SKILL.md"), "utf8");
const context = `Superpowers bootstrap (repo-local adapter).\n${instructions}\n\nHost adaptation: superpowers:<name> references resolve to the managed shared skill named <name> in .agents/skills. Read its upstream file and use the host's actual tools; do not invent missing tools. Repository AGENTS.md policy overrides remain authoritative. Only the selected design profile is active.`;
console.log(JSON.stringify(process.env.CLAUDE_PLUGIN_ROOT && !process.env.COPILOT_CLI ? {
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context }
} : { additionalContext: context }));
