# Landing page copy

- [English copy](en.md): intended language for the public landing page.
- [Polish preview](pl.md): equivalent copy for discussion and review.

Baseline: `main` at `066532f`. The `landing-page` branch starts from that commit.
These documents prepare the page content; they do not deploy a website.
The copy includes the functionality implemented in PR #1 and PR #2, as requested
for the landing page. Their implementation is not merged into this copy branch.

## Editorial direction

Position Necto as an OpenAPI UI for following API workflows through reusable
response values. Lead with the developer task and the copying/context problem;
explain the source generator after showing the workflow.

The generator supports Minimal API registrations with constant `.WithName(...)`
operation IDs in the same fluent chain. With PR #1, response selectors also
describe nested objects and array items through objectPath metadata. FastEndpoints
is demonstrated through explicit mappings, not automatic endpoint discovery
by the generator. Suggestions are compile-time matches, not inferred business
relationships or a guarantee that an API call will succeed.

## Feature scope

PR #1 provides selectable, syntax-colored JSON Preview, nested response paths,
and editable related-request inputs with native suggestions. PR #2 adds local
Preview pagination, a background parser, bounded suggestions, and large-payload
examples. Both are included in the Polish and English copy.

Distinguish UI pagination from API pagination. Preserve the qualification around
the 117 MB / 100,000-record Chromium result: this is a development-environment
measurement, not a claim of instant rendering on every device or unlimited
payload sizes. The full response still occupies browser memory. Dropdown
suggestions are bounded to 200 values per mapping; manually entered values and
selections from any Preview page remain usable.

## Before publication

- Replace repository-relative documentation links with the final site's routes.
- Confirm the repository is public before enabling its GitHub call to action.
- Confirm the license and distribution details before adding an open-source
  license badge, package-install command, or a link to a published NuGet package.
- Choose a recording matching the code being advertised. The existing Preview
  recording demonstrates the selection flow in PR #1.

The motivation is written as the concrete problem Necto addresses. It does not
attribute an invented origin story or quotation to the author.
