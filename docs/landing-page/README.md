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

Open `http://localhost:4173/`. No Node.js, dependencies, framework build or external image/font service is needed. The directory can be hosted unchanged by any static host. GitHub Pages serves this directory using the repository’s deployment workflow.

The interactive invoice example is explicitly labeled sample data and never calls an API. Gallery screenshots are real captures of the current sample application, not generated UI mockups. Tab navigation supports arrows/Home/End, images open in a native dialog, and code blocks support copying with a manual fallback. Reduced motion is respected.

## GitHub Pages publication

The public website is [https://nilphilus.github.io/necto/](https://nilphilus.github.io/necto/), with the technical guide at [technical.html](https://nilphilus.github.io/necto/technical.html). The source repository is public.

The [GitHub Pages workflow](../../.github/workflows/pages.yml) deploys `docs/landing-page` as the site root when this directory changes on `main`, or when manually dispatched. GitHub Pages uses **GitHub Actions** as its deployment source. Relative asset and page links support the `/necto/` project path without a build-time base URL. Opening `index.html` on GitHub itself shows source; use the public website for the rendered page, or the local preview for unpublished changes.

## Content decisions

Lead with response-to-request value reuse, then show saved chains, Scenario Builder, whole-response search and graph views in one gallery. The workbench section covers protected APIs, request and response formats, checks and CI reports. Installation details and implementation limits live on the technical page.

Retain the repository tagline **OpenAPI UI with a backbone.** Use the `Necto.OpenApi` package name. The gallery covers features from the repository, and the technical guide explains how to try them from the samples if the published package has an earlier UI.

The short **Why Necto?** note links the name to Latin *nectō* (to bind or connect) and the product's response-to-request connections. Its dictionary reference is [Lewis & Short, via CLD](https://cld.bbaw.de/lemma/lat/necto).

## Screenshot provenance

Captured from SampleApi with the UI from main `3286b4b` at 1366 × 900:

- `workflow.png`: invoice 42 selected, related requests pinned beside the response.
- `scenarios.png`: replay of Invoices → Invoice lines → Invoice line.
- `search.png`: search for 100999 in a 1000-record response; mapped object selected on its later Preview page.
- `graph.png`: endpoint graph opened from Invoice lines, fitted to view.

`scenario-builder.png` comes from the [Scenario Builder documentation](../scenario-builder/images/connection-map.png), whose capture shows the request map and selected response.

Use sample data only when refreshing these assets. Keep the complete original captures for the image viewer. Product buttons in screenshots are images; the separate interactive example is the working, browser-local demonstration.
