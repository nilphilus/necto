# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. You can send a GET or HEAD that takes a single mapped parameter directly from this section, or open the request to review and edit it. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

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
