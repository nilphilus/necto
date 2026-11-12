# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. You can send a GET or HEAD directly using a mapped parameter when the active presets or call-flow supplies any other required parameters. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

## External APIs

In **Settings → External APIs**, add a name, a stable API ID, the OpenAPI URL,
and the Necto endpoint-mappings URL. URLs must be absolute HTTP(S) addresses.
The optional API base URL overrides OpenAPI servers; otherwise the selected
OpenAPI server is used, falling back to the document URL's origin.

Use **Test** to check a connection, **Edit** to change its URLs, or **Remove** to
forget it. API IDs use lowercase letters, numbers, and hyphens and cannot change
while editing; `local` is reserved for the host API. Connection settings and the
visibility preference are saved in browser local storage for the host OpenAPI
URL. No server-side configuration is changed.

The **Show external APIs** switch in the API workspace controls external catalog
groups, related targets, and response-value suggestions. External groups and
requests show the API name/ID. Hiding the connections returns a mixed request
chain to its last local step. In-flight metadata loads are canceled; successful
metadata is cached for re-enabling the switch. Existing requests are not canceled.
Changing or removing a connection clears that API's drafts and response history.
Connection errors are reported individually without blocking the host API.

Operation IDs and request history are scoped by API connection ID, so identical
operation IDs and paths across services remain independent. Each API resolves
its own schemas and uses its own request URL. Mappings without API IDs apply
only within the API serving that mapping document.

### Cross-API mappings

To explicitly connect services, use the optional `apiId` on a mapping's source
and/or target. Its value must match a configured connection ID, or `local` for
the host API. An omitted `apiId` means the API that serves the mapping. For
example, this entry in either mapping document links the host's **Invoices**
response to **GetInvoice** in the connection named `billing`:

```json
{
  "source": { "apiId": "local", "operationId": "Invoices", "eachItem": true, "property": "id" },
  "target": { "apiId": "billing", "operationId": "GetInvoice", "location": "path", "name": "invoiceId" },
  "match": "name",
  "suggestedIdentifierType": "InvoiceId"
}
```

The .NET `ResponseValue` and `RequestValue` records expose nullable `ApiId` init
properties for supplying such mappings. Null IDs are omitted from JSON to preserve
existing mapping responses. Generated mappings remain scoped to their own API;
matching identifiers across services does not automatically create a link. Both
operations and the target input must be present in the visible catalogs.

### Request context and browser access

Active presets are not applied to external requests by default. A connection can
explicitly opt into **Apply active request presets**, including their headers.
Local call-flow overrides do not propagate to external services. Metadata
requests always omit cookies and request presets; metadata endpoints must be
accessible without those credentials. Requests use the browser's normal fetch
credentials behavior, rather than forwarding host cookies to another origin.

External metadata and API routes must allow the UI's origin through CORS. For
an ASP.NET Core external service, a development policy can be registered before
building the app and enabled before its endpoints:

```csharp
builder.Services.AddCors(options => options.AddPolicy("NectoUI", policy =>
    policy.WithOrigins("http://localhost:5000").AllowAnyHeader().AllowAnyMethod()));

// After builder.Build(), before endpoint execution:
app.UseCors("NectoUI");
```

Use the actual origin of the UI, including its port. An HTTPS UI requires HTTPS
external endpoints. No proxy is introduced by Necto.

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
