# Elena Simina

A Romanian private-tutoring website with a spiral-notebook setting, a margin pen
and an approved portrait of Elena. The browser uses vanilla HTML/CSS/JavaScript:
no React, backend, tracking, social embeds or remote fonts.

**Live:** https://danielsialexandra.github.io/SiminaElena/

## Develop and build

Use Node 24 (Vite requires Node 20.19+ or 22.12+). From the repository root:

```text
npm ci
npm run dev
```

Open the local URL Vite prints. The Vite source root and environment directory are
`site/`, not the repository. Filesystem access outside that root is restricted.
Never serve the whole repository with a generic file server.

```text
npm test
npm run build
npm run test:dist
npm run preview
```

`build` writes **`dist/`**, with hashed/minified JS and CSS plus explicitly minified
HTML. There are no production source maps. Relative asset URLs support the GitHub
project path. `dist/` is generated and ignored; do not commit it.
Opening the source HTML directly from disk is no longer supported because it
imports modules. Use Vite or serve the built `dist/` directory.

For the installed local runtime, prefix commands with the toolkit launcher:

```text
node tools/agent-toolkit/toolkit.mjs run npm run dev
node tools/agent-toolkit/toolkit.mjs run npm run build
```

## Content and artwork

- `site/index.html`: Romanian copy, native practical questions, Facebook contact
  and six complete `data-card` paper panels (two hero cards and four sections).
  Animate each panel including its background, not individual text fragments;
  do not nest animated cards.
- `site/styles.css`: paper colours, left binding, reserved right pen margin,
  responsive layout and reduced-motion rules.
- `site/assets/elena-simina.jpg`: permission-confirmed portrait supplied by the owner;
  200×200 pixels, deliberately displayed small rather than enlarged.
- `site/assets/pen.svg` and `handwriting.svg`: original local pen and handwritten paths.
- `site/assets/portrait-placeholder.svg`: original notebook artwork, retained as the favicon.
- `site/assets/patrick-hand-*.woff2`: locally hosted Patrick Hand, including Romanian
  diacritics. The SIL Open Font License and Lucide message-icon ISC notice are in
  `site/assets/third-party-licenses.txt`, linked from and included in the build.

No Facebook image URL is requested by visitors. Do not hotlink expiring CDN URLs.
Obtain permission before replacing a photograph; do not add pupils' photos without
appropriate consent. Update the explicit source-asset allowlist when adding public assets.

Copy reflects the family's description, not independently verified qualifications.
Lesson activities are examples to discuss. Location, format, availability, duration
and fees remain **De stabilit împreună** until confirmed. Do not invent reviews,
results, credentials or contact details.

## Motion contract

The six panels are sticky notes in three fixed pastel colours: butter yellow,
soft pink and sky blue (hero yellow, portrait pink, about blue, lessons yellow,
questions pink, contact blue). Each has a lighter adhesive band, a curled
lower-right corner and a soft lifted shadow, with a slight fixed tilt. The neutral
notebook ground dominates, pastel notes are secondary and forest ink/buttons plus
pins are accents. **60/30/10 is an approximate visual hierarchy**, not an exact
measured coverage. Do not randomize note backgrounds.

Each note gets one flat decorative inline-SVG pushpin. `createCardMotion` picks
sage (`#78967b`), ochre (`#b18733`) or clay (`#a26855`) once on initialization,
not on every entrance. After the note lands, the pin drops in, presses into the
paper and springs back (`pin-press`, 620ms). It is hidden during travel.
Pin colours stay stable across scrolling, reduced-motion changes and hidden-tab
suspension. Pins are static and visible without JavaScript or with reduced motion,
excluded from accessibility/navigation, and never block taps.
Section contents stack below 900px so tablet notes do not squeeze body copy into
narrow columns; the hero stacks below 650px.

`site/motion.js` coordinates replayable card entry/exit as a **page turn hinged at the
left spiral**: `perspective(1800px) rotateY(84deg) skewY(-8deg)` → curling frames →
slight overshoot → flat, and back to the turned-away pose on exit (vanilla Web
Animations, no page-flip library). A CSS `page-curl` light/shadow band sweeps across
the paper during the turn. Cards retain layout space, reverse from their current
appearance during interruptions, and become fully visible when focused or when
reduced motion is enabled. Content and questions work without JS.

Card triggers use **untransformed offset geometry** (`offsetTop`/`offsetHeight`, unaffected by 3D turns or tilts), not an IntersectionObserver on
the moving panel. Scroll/resize measurements are batched into one requested frame;
ResizeObserver also handles font/content reflow. No frame loop runs when idle.
Separate viewport bands prevent edge chatter: enter when the top is above 82%
and the bottom below 28% of viewport height; exit only when the top passes 98%
or the bottom passes above 18%.
The turn lasts **1000ms on entry / 750ms on exit**. The
earlier exit starts while a visible portion remains, so the turn can be seen
before the card leaves the screen.

`site/pen.js` owns the pen state machine. Mouse movement follows height and tilts
toward the cursor while staying in the **right** gutter. Touch taps update its
height; scroll gestures do not become taps. The normal cursor and links are unchanged.

After the pen settles within 0.5px for three frames, it waits **5000ms** and writes
one phrase, then rests. The phrases rotate between `Cu răbdare.`, `Pas cu pas.` and
`Ai curaj!`. Individual SVG strokes reveal sequentially and the nib follows the same
geometry. New input interrupts writing; scroll/resize cancels and restarts settling.
There is no permanent idle animation loop.

The fixed message icon links to the existing Contact section, including without
JavaScript. There is no play/pause button. Reduced-motion device preferences stop
decorative motion, cancel frame loops and idle timers, reveal all cards and park
the pen. Hiding the tab suspends activity; resuming never replays a stale timeout.
The transparent pen rail sits above the cards without clipping its tilted artwork
on phones; it never intercepts taps. No preferences are stored.

## Checks

`npm test` covers source content/privacy, contact/card states, reversal and
preference changes, pen lifecycle, exact idle timing and sequential stroke drawing.
`npm run test:dist` checks the actual built artifact, minification, relative assets,
absence of source maps and the public-file boundary.

Check the **production preview**, not only the dev page, with local Playwright:
phone/tablet/desktop, keyboard, no-JS, reduced motion, card re-entry, mouse/touch pen
tracking and idle interruption. Screenshots/recordings remain local.

The separate toolkit suite is:

```text
npm test --prefix tools/agent-toolkit
```

Its inherited Windows CRLF-sensitive ignore-file assertion is independent of the
website and Pages deployment.

## GitHub Pages

`.github/workflows/pages.yml` installs locked dependencies, tests, builds once and
checks the output. Pull requests validate only. On `master`, the validated artifact
is transferred to the deployment job and **only `dist/`** is published; no unchecked
rebuild occurs. Manual workflow runs on `master` are supported.

In **Settings → Pages → Build and deployment**, use **GitHub Actions**.
The repository owner approved public visibility for Pages. Do not change visibility
or configure custom domains without permission.

## Private resource material and tooling

`personal-info.txt` is local-only and ignored. Never stage, commit, serve, upload
or deploy it, or copy it into tests/logs. Only expressly approved extracted content
may become public. Keep credentials, tooling state, plans, screenshots and graphs
outside website source and deployment output.

Stage explicit paths and inspect staged changes. Vite's `root` and `envDir` stay
`site/`; never import root private files or use a root-wide copy/public directory.

See [the toolkit guide](docs/agent-toolkit/README.md). Intended profile:

```text
node tools/agent-toolkit/toolkit.mjs profile use public-site +motion +graphify +reticle
```

Graphify stays local, code-only and scoped to `site/`, with output outside the
public artifact. Reticle remains available but **uninstrumented**.
