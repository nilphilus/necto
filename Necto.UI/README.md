# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. You can send a GET or HEAD directly using a mapped parameter when the active presets or call-flow supplies any other required parameters. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

## Entity graph

Choose **Entity graph** in the workspace header to explore models from OpenAPI.
Each node represents a named object schema or an inline object used by a request
or successful response. Scalar schemas are excluded; nested models and schema
parameters are associated with the operations that use them.

Solid arrows show direct schema references (including nested properties and
composition). Dashed arrows show response-to-request value flows described by
Necto mappings. These are API model and value-flow connections, not inferred
database foreign keys. Value flows use the producing response model and the
consuming operation's response model, or its request model when no response
model exists. Consumers also appear under their source model's mapped inputs.

Click a node to inspect its connected endpoints and their request/response or
mapped-input roles. Click an endpoint to open its request editor. Request drafts
are preserved when switching between API and graph views. Use entity search,
connection filters, and zoom controls to navigate. The graph overview displays
up to 100 matching entities; refine the search for larger catalogs. Relationships
are also listed as buttons in the details panel, and nodes support keyboard
navigation.

The graph works without endpoint mappings: OpenAPI schema references remain
available. Only local OpenAPI schema references are resolved. Successful response
associations use explicit 2xx response codes; error/default responses are omitted.

## Endpoint graph

Choose **Endpoint graph** to inspect request-to-request connections separately
from the entity view. Every OpenAPI operation is a node, identified by its HTTP
method and path. Arrows point from the operation producing a response value to
the operation consuming it. Multiple mapped fields between the same pair of
operations share one arrow; the details panel lists every response selector,
resolved target location, target name, and match rule.

Select a node to inspect incoming and outgoing mappings, follow a connected
endpoint in the graph, or choose **Open request** to edit it. Search by name,
method, path, operation ID, or tag; filter to connected endpoints or to incoming
or outgoing connections for the selection. Zoom and keyboard navigation work
independently of the entity view. The overview displays up to 100 matching nodes.

Connections require valid Necto mappings resolved against available operations
and inputs. Shared schemas alone do not create endpoint connections. Without
mappings, operations remain visible as isolated nodes. Missing or ambiguous
operation IDs and unsupported target fields are skipped.

## Request presets

Use **Settings → Presets** to add a named preset. Choose **Add field**, select its type, and enter its name and value. For example, add these rows and choose **Save values**.

| Type | Name | Value |
| --- | --- | --- |
| Header | `X-Tenant` | `acme` |
| Path | `customer` | `customer-42` |
| Query | `locale` | `pl-PL` |

Check any combination of presets in the API view. For example, enable one preset for `customerId` and another for `assetId`. When multiple presets supply the same field, the most recently enabled preset wins for that field. The browser saves the presets and their activation order for this OpenAPI URL in local storage. Existing saved environments appear as presets.

Values match OpenAPI parameters by location and name. Header names are case-insensitive, and configured headers are also sent when the operation omits them from its OpenAPI parameters. Path names are case-sensitive. Query fields prefer exact names and also accept case differences when the match is unambiguous. Necto sends the query parameter name as it appears in OpenAPI. Use strings for values and JSON-encoded strings for array or object parameters. In a route like `/{customer}/Invoice/{id}`, a preset supplies `customer` and the request form supplies `id`.

Use the same field editor under **Call-flow overrides** to set values that take precedence over the active presets. Both take precedence over the request form and values selected from a related response. Overrides apply to the current request and all steps reached through related endpoints, including when navigating through the breadcrumbs. On reload, Necto restores the starting endpoint and saved overrides from local storage. Choosing an endpoint in the sidebar or changing the active presets starts a new call-flow and clears its saved overrides.

## ASP.NET Core

In an application that uses `AddOpenApi()` and references the Necto package, register the UI alongside the OpenAPI endpoint.

```csharp
using Necto;

// After builder.Build()
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseNectoUI();
}
```

The UI opens at `/necto/` and reads `/openapi/v1.json` by default. Both paths are relative to the ASP.NET Core application's path base. To use a different UI path and an existing OpenAPI endpoint, call `app.UseNectoUI(routePrefix: "/docs/api", openApiPath: "/swagger/v1/swagger.json")`.

## Development

Building or packing Necto from source requires Node.js 22.12 or later and pnpm. MSBuild installs the dependencies from the lockfile, builds the frontend, and embeds its assets. Applications using the published NuGet package only need the .NET runtime.

Run `dotnet run --project SampleApi --launch-profile http` from the repository root to try the packaged UI at `http://localhost:5000/necto/`. To work on the frontend with hot reload, keep SampleApi running and run `pnpm dev` from `Necto.UI`. Vite proxies configuration, OpenAPI, endpoint mappings and SampleApi calls.

The Vue frontend uses vertical slices under `src/features`. Each slice keeps its components and logic together. `api-catalog` handles discovery and navigation, `request-runner` owns request drafts and responses, and `related-endpoints` resolves mappings against response values. `App.vue` connects the three slices.
