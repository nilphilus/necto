# Landing page copy

- [English landing page](en.md): intended public-facing product copy.
- [Polish preview](pl.md): equivalent copy for discussion and review.
- [Technical guide](technical.md): implementation, integration, and performance details.

The branch starts from main at `066532f`. At the author's request, the content
also describes functionality implemented in PR #1 and PR #2. Those implementation
branches are not merged into this copy branch. These documents prepare page
content and do not deploy a website.

## Editorial direction

Use the repository description verbatim: **OpenAPI UI with a backbone.**
Retain it in both language versions as the product tagline.

Lead with the outcome: follow an API workflow, carry useful values forward,
and choose the next request with less manual copying. Use the invoice flow
to make that benefit concrete. Describe Preview, local pagination, presets,
and ASP.NET Core hosting in terms of the work they help users do.

Keep generator rules, CLR types, pagination thresholds, setup code, and measured
performance details in the linked technical guide. The landing page uses a
short, factual 117 MB / 100,000-record proof point with a link to its context.
Do not claim unlimited payloads, zero main-thread pauses, or automatic discovery
of business relationships. The copy intentionally omits unfinished workflow
settings.

## Publication notes

Replace repository-relative links with final site routes when implementing the
page. Confirm the license and package distribution details before adding badges
or install commands. Use the existing response-selection recording alongside
the matching feature. The GitHub call to action targets the repository's real
URL and is intended for its public launch.
