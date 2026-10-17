# Website

The vanilla Vite source lives only in `site/`; production output is `dist/`. Use semantic HTML, CSS and vanilla JavaScript; no React, backend, analytics or third-party embeds. Keep essential content and contact links usable without JavaScript, and respect reduced motion. Reserve the left spiral and right pen gutters. Keep the transparent pen layer above cards and unclipped on phones, with pointer events disabled. The message shortcut links to `#contact`; system motion preference controls decorative motion. Use the locally hosted Patrick Hand font with Romanian diacritics and preserve its bundled license.

Write Romanian copy from verified information. Never invent qualifications, reviews, prices, locations or availability. Clearly label illustration placeholders and unconfirmed logistics.

`personal-info.txt` is private local resource material. Never stage, commit, upload or deploy it. Only expressly approved extracted information may become public content. Stage explicit paths, and deploy only validated, minified `dist/`, never source or the repository root. Keep Vite `root` and `envDir` scoped to `site/`; never import private input. Preserve private files and ignored local state.

Run `npm test`, `npm run build` and `npm run test:dist` for website changes. Verify the production preview with local Playwright: responsive layout, keyboard/no-JS, reduced motion, bottom-entry/top-exit slides of whole paper panels (including their backgrounds) and pen pointer/touch behavior. Do not nest animated cards or animate paragraphs individually. The pen writes once after settling plus exactly 5000ms; cancel timers/frame loops on reduced motion, hidden tab or interruption. Use Graphify only on public code, locally and code-only; Reticle stays uninstrumented unless explicitly approved.

# Agent toolkit

In a new checkout, run the toolkit's `setup` before `run copilot`/`run claude`; ignored local dependencies are not inherited from the template. The launcher validates prerequisites and regenerates its local bootstrap without switching profiles.

Read `docs/agent-toolkit/README.md` before using or switching the installed toolkit. Shared active skills are managed adapters in `.agents/skills/`; complete pinned upstream sources and local tool state live in ignored `.agent-toolkit/`. Never overwrite a modified/unmanaged skill or activate competing design directors. Use `node tools/agent-toolkit/toolkit.mjs profile list` and `profile use <name> [+pack ...]`, then reload/restart the host. Start with `using-superpowers` on hosts without the supported repo-local startup hook; namespaced `superpowers:<name>` references map to the shared skill `<name>`.

Superpowers is the normal process owner, not authority to bypass user approval. Default to inline execution; use subagents only when appropriate and authorized. When bunshin is explicitly selected, do not also start a competing Superpowers implementation loop. Preserve user changes (including when applying TDD); meaningful scope/behavior changes still need clarification. Keep plans in the session workspace unless repository plans are requested. No automatic cloud uploads, provider routing, paid generation, app instrumentation, global hooks or floating installers. Use the local tool launcher rather than changing system runtimes. Graphify is code-only by default; OmniRoute is unconnected, Reticle uninstrumented and Superdesign service use opt-in.

# Improving the tooling

When the same manual workaround or ad-hoc command comes up repeatedly, recommend a small cross-platform command or an update to an existing tool instead of repeating it. Describe the need, how often it came up, and the proposed interface, then ask the user before implementing. Add tests and update the relevant documentation when a tool changes.

Agent-toolkit unit tests live in `tools/agent-toolkit/toolkit.test.mjs`; the separate `Agent toolkit tests` workflow exercises profile safety without installing external runtimes.
