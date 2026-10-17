export const sources = {
  superpowers: ["obra/superpowers", "bb92a77741419a4ab5f06e711a283343f1ada0c3"],
  uiux: ["nextlevelbuilder/ui-ux-pro-max-skill", "56ea9cf174ed86786187daa9de0e6247cb0747e4"],
  dna: ["zanwei/design-dna", "593e39bc9e3652734653bd75544a333d7d43615e"],
  icons: ["better-auth/better-icons", "033316ecb8f4982235af4111a2257e80231f5ab1"],
  polish: ["jakubkrehel/make-interfaces-feel-better", "35545ea1512ad59fa463e6b1f95ca9c052981fe6"],
  ibelick: ["ibelick/ui-skills", "705d082e60621d371f6de163c7243d23cfdc8def"],
  guidelines: ["vercel-labs/agent-skills", "063bee94c3f4df8453406c830b0a7df0f2860278"],
  taste: ["Leonxlnx/taste-skill", "f624f37a8c650b9cc550253104925efe4c8de246"],
  genjutsu: ["AThevon/genjutsu", "1f518a71378b15d423389e546e767cffc86e14c3"],
  motion: ["LottieFiles/motion-design-skill", "f9a8a041b85185ee4881b3471d3415e939aac772"],
  gsap: ["greensock/gsap-skills", "aed9cfd3277740755f6bfc1155c7aa645403b760"],
  three: ["CloudAI-X/threejs-skills", "b1c623076c661fc9b03dac19292e825a5d106823"],
  remotion: ["remotion-dev/skills", "1441a11e95db35443bd76bb318386c0d3ca00053"],
  playwright: ["microsoft/playwright-cli", "b85c7a736bb473bf55b584e54a09ffa698d6d871"],
  inspector: ["NVIDIA/SkillSpector", "cf5cac7ba5c756a6e0ebf52dc9763f49422f889f"],
  graphify: ["Graphify-Labs/graphify", "86c57be8204673c2a1b9849a3292a7dd3ab373d8"],
  reticle: ["reticlehq/reticle", "e907dc62dd2e77a4433c2fb908419378c947774d"],
  superdesign: ["superdesigndev/superdesign-skill", "f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b"]
};

const skill = (source, path, name, description, extra = {}) => ({ source, path, name, description, ...extra });
export const base = [
  skill("dna", "SKILL.md", "design-dna", "Use only for explicit reference analysis, palette measurement or design DNA extraction, not a new competing design direction."),
  skill("icons", "skills/SKILL.md", "better-icons", "Search or retrieve SVG icons for the chosen project icon family."),
  skill("polish", "skills/make-interfaces-feel-better/SKILL.md", "make-interfaces-feel-better", "Explicit interface-polish review after design approval. Do not override the selected motion contract."),
  ...["fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "create-design-md", "component-canvas"].map(name =>
    skill("ibelick", `skills/${name}/SKILL.md`, name, `Use for scoped ${name.replaceAll("-", " ")} tasks; preserve the approved project design and stack.`)),
  skill("guidelines", "skills/web-design-guidelines/SKILL.md", "web-design-guidelines", "Explicit technical web-interface audit; local pinned rules replace the upstream floating download.", { resource: "guidelines/command.md" }),
  skill("playwright", "skills/playwright-cli/SKILL.md", "playwright-cli", "Browser interactions and screenshots using the local Playwright CLI; not image generation."),
  skill("inspector", "skills/skill-inspector/SKILL.md", "skill-inspector", "Review skills before installation with source-aware judgment and optional local static scanner. No LLM scans without consent.")
];

export const profiles = {
  base: { description: "Process and general web-quality specialists; no design director.", skills: [] },
  app: { description: "UI UX Pro Max app research and one design-system contract.", skills: [
    skill("uiux", ".claude/skills/ui-ux-pro-max/SKILL.md", "ui-ux-pro-max", "Selected app design director: local UI/UX research for app screens. Preserve the actual platform and stack.")
  ] },
  "public-site": { description: "Taste current public-page director (not dashboards).", skills: [
    skill("taste", "skills/taste-skill/SKILL.md", "design-taste-frontend", "Selected public-site director for landing pages, portfolios and public product pages.")
  ] },
  redesign: { description: "Taste targeted redesign, keeping the existing stack.", skills: [
    skill("taste", "skills/redesign-skill/SKILL.md", "redesign-existing-projects", "Selected existing-project redesign profile; do not rebuild the app without permission.")
  ] },
  minimalist: { description: "Taste editorial, restrained product aesthetic.", skills: [
    skill("taste", "skills/minimalist-skill/SKILL.md", "minimalist-ui", "Selected minimalist visual direction; not active with soft or brutalist directions.")
  ] },
  soft: { description: "Taste high-end soft visual aesthetic.", skills: [
    skill("taste", "skills/soft-skill/SKILL.md", "high-end-visual-design", "Selected soft/high-end visual direction; not active with other aesthetic directors.")
  ] },
  brutalist: { description: "Taste industrial/brutalist aesthetic, deliberately selected.", skills: [
    skill("taste", "skills/brutalist-skill/SKILL.md", "industrial-brutalist-ui", "Selected industrial/brutalist visual direction; not a universal UI default.")
  ] },
  "baseline-react": { description: "Restrained React/Tailwind/Motion constraints; GSAP and other motion directors excluded.", skills: [
    skill("ibelick", "skills/baseline-ui/SKILL.md", "baseline-ui", "Selected restrained React/Tailwind/Motion profile; applies its explicit library/animation restrictions.")
  ] },
  "genjutsu-paint": { description: "Genjutsu full design director; process gates belong to its approved design phase.", skills: [
    skill("genjutsu", "skills/paint/SKILL.md", "paint", "Selected Genjutsu visual director; preserve project approvals and do not run another whole-task director.")
  ] },
  "genjutsu-bunshin": { description: "Explicit full-site Genjutsu orchestration; no simultaneous Superpowers implementation loop.", skills: [
    skill("genjutsu", "skills/bunshin/SKILL.md", "bunshin", "Selected full-site workflow after explicit budget/scope approval. Do not also start a Superpowers implementation orchestration loop.")
  ] },
  superdesign: { description: "External Superdesign canvas workflow, service use requires separate approval.", skills: [
    skill("superdesign", "skills/superdesign/SKILL.md", "superdesign", "Only for an explicitly approved Superdesign service task. Installation does not authorize login, uploads or generation.")
  ] }
};

export const extensions = {
  motion: [skill("motion", "skills/motion-design/SKILL.md", "motion-design", "Explicit motion brief and choreography; respect one approved timing contract.")],
  cast: [skill("genjutsu", "skills/cast/SKILL.md", "cast", "Explicit Genjutsu interaction phase after visual approval, not a second full-site controller.")],
  gsap: ["core", "timeline", "scrolltrigger", "plugins", "utils", "frameworks", "react", "performance"].map(name =>
    skill("gsap", `skills/gsap-${name}/SKILL.md`, `gsap-${name}`, "Use only when GSAP is already the approved animation engine. Never select/install it just because this reference is available.")),
  three: ["fundamentals", "geometry", "materials", "lighting", "textures", "animation", "loaders", "shaders", "postprocessing", "interaction"].map(name =>
    skill("three", `skills/threejs-${name}/SKILL.md`, `threejs-${name}`, "Use for an explicitly requested Three.js feature only; do not add a new runtime without permission.")),
  video: ["best-practices", "create", "render", "markup", "multimedia", "captions", "docs", "interactivity", "maps", "studio", "upgrade", "saas"].map(name =>
    skill("remotion", `skills/remotion-${name}/SKILL.md`, `remotion-${name}`, "Use inside an explicitly requested Remotion video/composition context, not ordinary application UI.")),
  graphify: [skill("graphify", "graphify/skill.md", "graphify", "Explicit local code graph/index task. No cloud, semantic extraction, global hooks or search interception without separate consent.")],
  reticle: [
    skill("reticle", "SKILL.md", "reticle", "Explicit Reticle setup/verification request only. Installation here does not authorize app instrumentation, automatic init or remote-shell installers."),
    ...["debug-broken-ui", "false-green-tests", "test-error-states", "verify-ui-change", "replay-user-flows", "verify-form-validation", "verify-keyboard-access"].map(name =>
      skill("reticle", `skills/${name}/SKILL.md`, name, "Explicit Reticle verification task after the user approves SDK instrumentation; do not initialize an app automatically."))
  ]
};

export function selection(profile = "app", extras = []) {
  if (!Object.hasOwn(profiles, profile)) throw new Error(`Unknown profile ${profile}`);
  if (extras.some(extra => !Object.hasOwn(extensions, extra))) throw new Error("Unknown extension; use profile list");
  if (profile === "baseline-react" && extras.some(extra => ["gsap", "motion", "cast"].includes(extra))) {
    throw new Error("baseline-react cannot enable gsap, motion or cast; choose a different profile");
  }
  if (profile.startsWith("genjutsu") && extras.includes("cast")) throw new Error("Select cast separately from the full Genjutsu director");
  const skills = [...base, ...profiles[profile].skills, ...extras.flatMap(extra => extensions[extra])];
  if (new Set(skills.map(item => item.name)).size !== skills.length) throw new Error("Duplicate skill names");
  return skills;
}
