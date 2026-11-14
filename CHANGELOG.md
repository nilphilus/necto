# Changelog

## 0.3.0 — 2026-11-14

### Authenticated API exploration

- Load protected OpenAPI documents and authenticate requests through Bearer/JWT, Basic, API keys, existing browser sessions and OAuth2/OIDC Authorization Code with PKCE.
- Scope credentials to each API and approved origins; keep authentication in tab memory.
- Attach ASP.NET Core endpoint metadata to Necto UI routes with `MapNectoUI()` and discover the configured mappings route.

### Richer requests and responses

- Send multipart files, URL-encoded forms, text/XML and binary bodies alongside JSON.
- Inspect exposed HTTP headers, download original response bytes, and cancel requests or set timeouts.
- Read contracts and examples, select schema variants, import JSON/YAML documents, resolve external references and convert common Swagger 2.0 definitions.
- Copy masked cURL, JavaScript fetch and C# HttpClient snippets; import supported cURL commands as reviewed drafts without execution.
- Inspect SSE/NDJSON events using mapped-object selection; optionally view object collections in a bounded, paginated table.

### Repeatable workflows

- Keep response context separate from edited request inputs and retain a masked sent-request snapshot.
- Restore nonsecret draft inputs from bounded history and compare chosen responses.
- Import/export named workspace items and individual scenarios without replacing unrelated collections.
- Add declarative response checks, conditional object bindings and supported native OpenAPI Links.
- Export scenario CI bundles and produce JSON/JUnit reports with explicit API targets and write opt-in.

### Compact, accessible UI

- Use contextual quick actions, readable contracts and keyboard-accessible Tools sections.
- Keep Next request in the response toolbar and give previews more available space.
- Improve scenario inspection, catalog/header layouts, mobile sheets and focus restoration.

### Compatibility and validation

- Requires .NET 10. The NuGet package includes the compiled frontend and Roslyn generator.
- The CI runner requires a repository checkout, Node 22.12+ and UI dependencies; cross-API replay and file uploads are not reproduced by the runner.
- OpenAPI 3.2, Swagger 2.0 conversion and JSON Schema checks remain explicitly partial. Browser CORS and credential-origin permissions still apply.
- Integrated validation: 138 UI tests, 29 .NET tests and browser checks covering authentication, request formats and the combined UX workflows.

[Compare v0.2.1...v0.3.0](https://github.com/nilphilus/necto/compare/v0.2.1...v0.3.0)
