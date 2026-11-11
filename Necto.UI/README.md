# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. You can send a GET or HEAD directly using a mapped parameter when the active presets or call-flow supplies any other required parameters. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

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
