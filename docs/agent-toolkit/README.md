# Local agent toolkit

This repository has a **full pinned Superpowers process suite**, a shared domain-skill library, isolated local tools, and mutually exclusive design profiles. Nothing is installed into your personal skill directories or default system runtimes.

## Quick start and profile switching

From the repository root:

```text
node tools/agent-toolkit/toolkit.mjs setup
node tools/agent-toolkit/toolkit.mjs doctor
node tools/agent-toolkit/toolkit.mjs profile list
node tools/agent-toolkit/toolkit.mjs profile use app
node tools/agent-toolkit/toolkit.mjs profile use public-site +gsap
node tools/agent-toolkit/toolkit.mjs profile use genjutsu-paint +three
node tools/agent-toolkit/toolkit.mjs profile use app +graphify +reticle
```

**After switching, restart/reload the agent.** Skills already invoked in an existing conversation cannot be unloaded by changing files. Do not switch profiles during another active coding session in this worktree.

`setup` downloads verified pinned archives, installs locked dependencies and Chromium, prepares the bootstrap adapter, then activates `app`. It requires an existing Node/npm, `tar`, and Python 3.12+ (`TOOLKIT_PYTHON` can specify an executable). This host already has `/usr/bin/python3.12`; the installer uses it to create `.agent-toolkit/python`. It does not replace `/usr/bin/python3`, change your shell profile or modify your system Node. On machines without modern Python, install it alongside the old version before setup; no unattended OS package installation is attempted.

To keep the installation ready for another agent, run setup on that machine/checkout. The installed vendor and runtime directories are intentionally git-ignored; **the pinned definitions, archives' SHA-256 checksums, npm lockfiles, Python hash lock and profile manager are the reproducible installation**.

### Profiles

| Profile | Active design director/style |
| --- | --- |
| `base` | No visual director; process and general specialists |
| `app` | UI UX Pro Max core for application UI |
| `public-site` | Taste current public-page director |
| `redesign` | Taste targeted existing-project redesign |
| `minimalist` | Taste minimalist/editorial aesthetic |
| `soft` | Taste soft/high-end aesthetic |
| `brutalist` | Taste industrial/brutalist aesthetic |
| `baseline-react` | ibelick restrained React/Tailwind/Motion baseline |
| `genjutsu-paint` | Genjutsu visual-system direction |
| `genjutsu-bunshin` | Explicitly approved Genjutsu whole-site orchestration |
| `superdesign` | Opt-in external Superdesign canvas workflow |

Each selection also exposes all 15 Superpowers consumer process skills and these 11 shared specialists:

- Design DNA; better-icons; make-interfaces-feel-better.
- ibelick fixing-accessibility, fixing-motion-performance, fixing-metadata, create-design-md and component-canvas.
- Vercel web-design-guidelines; Microsoft playwright-cli; NVIDIA skill-inspector.

Optional packs, enabled by `+name` after the profile:

| Pack | Added capabilities |
| --- | --- |
| `+motion` | LottieFiles motion planning |
| `+cast` | Genjutsu's bounded interaction workflow |
| `+gsap` | All eight official GSAP skills |
| `+three` | All ten Three.js skills |
| `+video` | Twelve Remotion consumer skills |
| `+graphify` | Local code graph consumer skill |
| `+reticle` | Reticle entrypoint and seven focused verification skills |

Packs do not install application libraries such as React, GSAP or Remotion into your app. Their skill knowledge becomes available; those runtimes belong in the particular app's dependency manifest when needed.

`baseline-react` rejects `+gsap`, `+motion` and `+cast`. Full Genjutsu directors reject `+cast` as a duplicate director phase. Do not combine different engines on the same animated property, or apply the polish skill's fixed animation recipe over the selected motion contract. General UI specialists remain review/repair capabilities; the chosen director owns visual decisions.

All other profile sources remain on disk **outside agent discovery**. Keeping an inactive pack installed is not permission to invoke it automatically.

## Multiple agents and Superpowers bootstrap

The canonical active skills live in `.agents/skills/`. They are generated **adapters**, not incomplete copies: each points to an intact pinned upstream skill and its entire repository of scripts, references, modules and notices in `.agent-toolkit/vendor/`. The source bodies remain unchanged. This is an intentional local adaptation of activation descriptions, paths and permission boundaries.

| Host | Repo integration | Limits |
| --- | --- | --- |
| Copilot CLI | `.agents/skills` plus the repo bootstrap launcher below | Plugin recognized locally; bootstrap output tested without a model request |
| Claude Code | `.agents/skills` discovery depends on host version; use documented `.claude/skills` support or a host-approved adapter if absent | No Claude installation was available for end-to-end testing; do not claim hook parity |
| Codex / other Agent Skills consumers | Point the host at `.agents/skills`; start with `using-superpowers` | Standard-file integration only; native startup hooks/tool mappings vary |

Copilot, with a repo-local startup plugin and **no user-global install**:

```text
node tools/agent-toolkit/toolkit.mjs run copilot
```

Run `setup` once in **each new checkout** before using this launcher. Git does not copy the ignored vendor sources, local runtimes, managed skills or bootstrap plugin. The launcher now checks those prerequisites and prints the setup command rather than sending Copilot a nonexistent plugin path. Once the prerequisites exist, it regenerates the ignored bootstrap on launch, including after that directory was removed or setup was interrupted, without changing your selected profile.

The generated `.agent-toolkit/bootstrap` plugin has a Node hook that emits the **full pinned `using-superpowers` instructions** at startup/clear/compact. It contains no duplicate skill folders. Other Superpowers skills are loaded from the managed library. Namespaced `superpowers:<name>` references map to the corresponding unnamespaced shared skill `<name>`; this mapping is stated in the bootstrap and adapters.

For a host with supported `--plugin-dir` and compatible hook output, the same local bootstrap can be passed explicitly. The `run claude` convenience launcher is supplied for compatible Claude versions, but **has not been validated against an installed Claude host**. Do not run both this adapter and another Superpowers plugin simultaneously.

On hosts without this startup-hook interface, explicitly load `using-superpowers` first using that host's skill interface. All suite skills/resources are installed, but generic SKILL.md discovery alone is **not** equivalent to a native plugin's startup hook. Do not represent unsupported tools/agents as available.

The launcher hook uses Bash; on Windows use a Bash-capable host integration, or the shared skills with explicit bootstrap. The manager's profile generation uses ordinary file copies rather than symlinks and is covered by Windows CI. Upstream Genjutsu loaders and some Superpowers scripts also require Bash; cross-platform profile switching does not make upstream shell scripts platform-neutral.

### Project policy overrides

AGENTS.md and explicit user decisions remain authoritative:

- Superpowers owns the normal engineering process. Use inline execution unless the user selects an appropriate subagent workflow; do not force parallel implementation on every task.
- For `genjutsu-bunshin`, Superpowers provides the outer scope/permission/verification contract, but does not start a simultaneous competing implementation loop.
- Preserve all existing user work. TDD's delete-first language is **not permission to delete pre-existing or unrelated edits**. Clarify the safe scope of a test-first rewrite.
- Ask about meaningful behavior/scope changes, dependencies, purchases, cloud use, service credentials and publishing. Routine implementation details within an approved specification can be chosen and recorded.
- Planning artifacts belong in the session workspace unless the user requests repository plans; do not create a competing plan hierarchy automatically.
- No tool is allowed to bypass a denied permission, emit fabricated execution evidence or turn an upstream installer example into authorization.

These policy overrides and the profile filters address **known** contradictions; they do not certify all upstream instructions as conflict-free for every task.

## Running local tools and older runtimes

```text
node tools/agent-toolkit/toolkit.mjs run node --version
node tools/agent-toolkit/toolkit.mjs run python --version
node tools/agent-toolkit/toolkit.mjs run graphify --version
node tools/agent-toolkit/toolkit.mjs run skillspector --version
node tools/agent-toolkit/toolkit.mjs run better-icons --help
node tools/agent-toolkit/toolkit.mjs run playwright-cli open http://127.0.0.1:3000
node tools/agent-toolkit/toolkit.mjs run playwright-cli close
node tools/agent-toolkit/toolkit.mjs run reticle --version
node tools/agent-toolkit/toolkit.mjs run superdesign --version
node tools/agent-toolkit/toolkit.mjs run omniroute --version
```

Ordinary `node`, `npm` and `python3` still resolve as before. The launcher alone prepends local paths for its child process. Installed versions:

| Component | Pin |
| --- | --- |
| Isolated Node / npm | 24.22.0 / 11.13.0 |
| Python environment | Python 3.12+ in `.agent-toolkit/python` (3.12.14 on this machine) |
| Graphify | `graphifyy` 0.9.92 |
| SkillSpector | 2.12.0, immutable NVIDIA source archive because that release is not on PyPI |
| Playwright CLI | 0.1.22, matching Chromium runtime |
| Reticle | 3.7.0 |
| Superdesign CLI | 0.14.0 |
| better-icons | package 1.0.4; its bundled version banner incorrectly prints 1.0.0 |
| OmniRoute | 3.8.51 |

Tools that write service/account state get a dedicated local home under `.agent-toolkit/homes/`; Reticle has dedicated state paths. Telemetry opt-out variables are supplied. This is **not an OS sandbox**: these programs still run as you. The launcher does not read `.env.private`.

### Explicitly not enabled

- **Graphify Cloud and semantic/model extraction:** `GRAPHIFY_BACKEND=none` is set. Use `extract <path> --code-only`. No global hooks/search interception are installed.
- **OmniRoute providers/routing:** no service is started, account connected or agent endpoint changed.
- **Reticle:** no SDK injected into any app; no MCP server automatically registered. A version check is not a verified instrumented app.
- **Superdesign:** no login, context upload or generation. Its installed skills cannot provide an offline equivalent of its hosted canvas.
- **Impeccable:** not installed just because Genjutsu bunshin mentions it. The upstream degraded path is available; adding the external pack requires a separate decision.
- **Apps:** no frontend/video project, API provider credentials, model caches or paid tasks are created.

### Remaining upstream advisories

OmniRoute's dependency tree still reports **four high-severity audit entries**: `braces`, and inherited entries through `micromatch`, `http-proxy-middleware` and `omniroute`. These are related dependency-chain entries, not four independently proven vulnerabilities in this setup. The `braces` advisory is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); the current published version has no available patch.

The lock applies pinned compatible security updates to `next` (16.3.8), DOMPurify, KaTeX and smol-toml, clearing the original critical finding. **Do not expose or start OmniRoute as a shared/public service until these residual findings are addressed or explicitly accepted.** Its UI/provider functionality was not exercised. Installing it is not an assertion that the service is production-ready.

Run `node tools/agent-toolkit/toolkit.mjs run npm audit --prefix tools/agent-toolkit/runtime` to inspect current advisories. Never use `npm audit fix --force` blindly on these third-party tool trees.

## Validation, upgrades and rollback

```text
npm test --prefix tools/agent-toolkit
node tools/agent-toolkit/smoke.mjs
```

The unit tests need no vendor downloads, tools or network. The separate smoke script needs setup: it builds a tiny local code graph, scans a harmless local skill statically, opens a localhost fixture, captures a screenshot and closes the browser/server. It never runs upstream target-skill scripts or sends model requests.

Setup and smoke were exercised on this Linux host. Chromium runs here, although Playwright warns that RHEL is not an officially supported distribution; other downloaded engines may require missing OS libraries. No OS libraries were installed to silence that warning.

To upgrade, explicitly review source revisions and update `catalog.mjs`; `lock-sources` downloads immutable archives and regenerates `sources.lock.json` with SHA-256 values. Review the diff, tool package manifests/locks and Python `.in`/hash-lock together. Existing vendor folders with different source markers are not overwritten automatically; inspect them and remove only the exact old pack directory before rerunning setup. Do not use floating skill updates.

Rollback: restore the desired committed catalog/locks and regenerate the managed profile after replacing only the corresponding local vendor/tool directories. Profile switching refuses user-modified files and competing `.github/skills`/`.claude/skills` content; preserve or relocate custom skills deliberately rather than deleting them to make setup pass.

Switches are serialized with `.agents/.toolkit-switch.lock` and staged before replacing the managed directory. If the process is interrupted, inspect the lock and any `skills.previous`/`skills.staging-*` directory before retrying; the manager refuses to guess which copy to discard. A reload boundary is still required—directory switching cannot atomically change an agent's already-loaded memory.

No local sources, credentials, binary caches or graphs should be committed. Upstream licenses/notices remain in the immutable ignored vendor archives, linked through `sources.lock.json`; the repo does not redistribute those full projects.
