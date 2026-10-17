# Elena Simina

A Romanian private-tutoring website for an experienced primary-school teacher.
The public website is dependency-free HTML, CSS and vanilla JavaScript in `site/`.
No React, backend, contact form, tracking, remote fonts or third-party embeds.

## Preview locally

With the local agent toolkit installed:

```text
node tools/agent-toolkit/toolkit.mjs run python -m http.server 8080 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:8080`. Stop the server with Ctrl+C.
Any static server serving **only `site/`** also works; never serve the repository root.
The page also opens directly from `site/index.html`.

## Edit the website

- `site/index.html`: Romanian copy, practical questions and the approved Facebook contact.
- `site/styles.css`: colours, typography, responsive layout and reduced-motion styles.
- `site/main.js`: optional once-only entrance motion. Content works without JavaScript.
- `site/assets/portrait-placeholder.svg`: original exercise-book illustration, not a real photograph.

The illustration is explicitly labelled. To use a real portrait, obtain permission,
place the approved image in `site/assets/`, update the image path, dimensions, alt text
and caption, and adjust the explicit asset allowlist in `tests/site.test.mjs`.
No children's photographs should be added without appropriate consent.

The public name is provisionally **Elena Simina**. Generated copy reflects the
family's description, not independently verified credentials. Lesson activities
are examples to discuss. Location, format, availability, duration and fees remain
**De stabilit împreună** until confirmed. Do not invent reviews, results or contact details.
Replace these placeholders with approved information when available.

## Checks

Node 20+ is sufficient for the dependency-free website checks; CI uses Node 24.

```text
node --test tests/site.test.mjs
node --check site/main.js
npm test --prefix tools/agent-toolkit
```

The website suite checks semantics, local links, the public asset allowlist, private-file
protection, optional motion and workflow boundaries. Use a local browser for responsive
layout, keyboard navigation, reduced motion and JavaScript-disabled checks.

## GitHub Pages

`.github/workflows/pages.yml` validates pull requests and deploys successful pushes
to `master`. It also supports manual runs from the Actions tab on `master`.
Only the **`site/` directory** is uploaded, never the repository or toolkit.
There is no build or application dependency installation.

In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**.
The deployment environment/action output reports the live URL; the standard project
address is `https://danielsialexandra.github.io/SiminaElena/`.
Relative assets support this project prefix as well as local previews.
Do not add a custom domain or root-relative asset URLs without updating and verifying deployment.

Pages availability depends on repository visibility and the account plan. This repository's
owner explicitly approved public visibility to enable Pages; do not change visibility
for other projects without permission.

## Private source material

`personal-info.txt` is local-only resource material. It is ignored by Git and must
never be staged, committed, uploaded, served or deployed. Only explicitly approved
extracted information may become public (currently the Facebook contact link).
Do not add the private file to test fixtures or copy its raw contents into logs.

Keep credentials and local tool state private. Stage explicit paths, inspect staged
changes before committing, and never upload the repository root as a Pages artifact.
The site test uses an explicit public-file allowlist and rejects symlinks.
Plans, screenshots, source-extraction notes and graph output belong outside public assets.

## Agent toolkit

See [the toolkit guide](docs/agent-toolkit/README.md) for installation and local tools.
The intended profile is:

```text
node tools/agent-toolkit/toolkit.mjs profile use public-site +motion +graphify +reticle
```

Graphify is local/code-only and scoped to public website code. Reticle is available
but **not instrumented**. Browser verification uses local Playwright.
