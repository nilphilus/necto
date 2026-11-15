# Necto product website

An English, buildless product website with a separate technical guide.

- [HTML landing page](index.html) — marketing page, interactive sample and product gallery.
- `technical.html` — installation, architecture, integrations and limits.
- `landing.css` / `landing.js` — shared styles and browser interactions.
- `assets/` — local brand asset and real screenshots from SampleApi on main.
- [English copy](en.md), [Polish review copy](pl.md), [technical text](technical.md).

## Preview

Open `index.html` directly in a browser, or serve this directory locally:

```sh
python3 -m http.server 4173 --directory docs/landing-page
```

Open `http://localhost:4173/`. No Node.js, dependencies, framework build or external image/font service is needed. The directory can be hosted unchanged by any static host. This change does not configure or deploy hosting.

The interactive invoice example is explicitly labeled sample data and never calls an API. Gallery screenshots are real captures of the current sample application, not generated UI mockups. Tab navigation supports arrows/Home/End, images open in a native dialog, and code blocks support copying with a manual fallback. Reduced motion is respected.

## GitHub Pages publication

The planned public URL is [https://nilphilus.github.io/necto/](https://nilphilus.github.io/necto/). It is not live yet. The repository is still private and this PR is being held until the product is ready.

When publishing, configure GitHub Pages to deploy this directory as the site root. Relative asset and page links support the `/necto/` project path without a build-time base URL. Opening `index.html` on GitHub itself shows source, not the rendered page; use the local preview until Pages is enabled.

## Content decisions

Lead with response-to-request value reuse, then show scenarios, whole-response search and graph views in one gallery. Presets, external APIs and Bring your agent are supporting capabilities. Installation details and implementation limits live on the technical page.

Retain the repository tagline: **OpenAPI UI with a backbone.** Use the real `Necto.OpenApi` package name. The NuGet package was checked at authoring time (0.2.2). Do not describe the Commons Clause license as unrestricted open source. Do not advertise unmerged authentication or unfinished call overrides, unlimited payloads, inferred business workflows, or an agent that executes requests inside Necto.

The short **Why Necto?** note links the name to Latin *nectō* (to bind or connect) and the product's response-to-request connections. Its dictionary reference is [Lewis & Short, via CLD](https://cld.bbaw.de/lemma/lat/necto).

## Screenshot provenance

Captured from SampleApi with the UI from main `3286b4b` at 1366 × 900:

- `workflow.png`: invoice 42 selected, related requests pinned beside the response.
- `scenarios.png`: replay of Invoices → Invoice lines → Invoice line.
- `search.png`: search for 100999 in a 1000-record response; mapped object selected on its later Preview page.
- `graph.png`: endpoint graph opened from Invoice lines, fitted to view.

Use sample data only when refreshing these assets. Keep the complete original captures for the image viewer. Product buttons in screenshots are images; the separate interactive example is the working, browser-local demonstration.
