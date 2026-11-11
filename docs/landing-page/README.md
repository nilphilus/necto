# Landing page copy

- [English copy](en.md): intended language for the public landing page.
- [Polish preview](pl.md): equivalent copy for discussion and review.

Baseline: `main` at `066532f`. The `landing-page` branch starts from that commit.
These documents prepare the page content; they do not deploy a website.

## Editorial direction

Position Necto as an OpenAPI UI for following API workflows through reusable
response values. Lead with the developer task and the copying/context problem;
explain the source generator after showing the workflow.

The generator supports Minimal API registrations with constant `.WithName(...)`
operation IDs in the same fluent chain. Current response selectors cover the
root object or root array items and their top-level properties. FastEndpoints
is demonstrated through explicit mappings, not automatic endpoint discovery
by the generator. Suggestions are compile-time matches, not inferred business
relationships or a guarantee that an API call will succeed.

## Add after the relevant changes reach main

PR #1 adds selectable, syntax-colored JSON Preview and editable related-request
inputs with native suggestions. PR #2 builds on it with local Preview pagination,
a background parser, bounded suggestions, and large-payload examples. Neither
is present in the fetched main baseline; the public feature copy above does
not claim them as available.

When PR #2 is included, explain UI pagination separately from API pagination.
The 117 MB / 100,000-record Chromium result is one development-environment
measurement, not a claim of instant rendering on every device or unlimited
payload sizes. The full response still occupies browser memory.

## Before publication

- Replace repository-relative documentation links with the final site's routes.
- Confirm the repository is public before enabling its GitHub call to action.
- Confirm the license and distribution details before adding an open-source
  license badge, package-install command, or a link to a published NuGet package.
- Choose a recording matching the code being advertised. The existing Preview
  recording demonstrates PR #1 and should accompany that feature once available.

The motivation is written as the concrete problem Necto addresses. It does not
attribute an invented origin story or quotation to the author.
