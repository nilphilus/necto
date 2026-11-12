# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. Each related request has editable fields with dropdown suggestions from the response. Type to filter the suggestions, choose a value, or enter a value that is not listed. Use **Send** for GET/HEAD requests with complete valid inputs, or **Edit** to open the request form. Request parameter inputs offer the same suggestions. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

## Response preview

JSON responses open in **Preview**, with colors for keys, strings, numbers,
booleans and null. **Raw** shows pages of the original response text. Other response
formats remain plain text.

Objects with generated mappings to available requests have a **Select** button.
For example, run **Invoice lines**, select the second item, and choose **Edit**
on **Invoice line**: its `lineId` is filled from that item. Selection fills the matching related-request fields and narrows dropdown
suggestions in request parameter inputs. The filled values remain editable.
This also works with nested objects and arrays. **Clear selection** restores all values. Selection belongs
to the response and stays when revisiting a breadcrumb; sending again replaces
it. Preview and colors work even without endpoint mappings.

## Large responses

Preview pagination is local to the UI: it never adds API query parameters or
makes another request. Arrays and objects render 25 entries per page, with
previous/next controls and a page-number input. Array indices and selection
paths are absolute, so selecting an item on page 4,000 fills the correct related
request field. Nested containers at depth two start collapsed and have their
own pagination when expanded. Long string values show 2,000 characters at a time.

Raw and non-JSON text show 20,000 characters per page. **Download response** saves
the complete original text, regardless of the visible page. JSON above one
million characters is parsed in a Web Worker, without creating a second
pretty-printed copy; parsed objects stay outside Vue's deep reactivity.

Suggestions inspect at most 200 values per mapping to keep dropdowns bounded.
Type another value manually, or select an object on any Preview page to use a
value outside that initial set. The whole HTTP response and parsed JSON still
live in browser memory: this bounds rendering, not download size or memory use.
Worker-to-main-thread transfer can still cause a pause for very large responses.

To try it, run SampleApi, open **Large invoice payload**, and set `count=100000`,
`noteSize=1024`. This produces one response of approximately 117 MB, with
100,000 records. Jump to page 4,000 and select the last item (`lineId=199999`),
then send **Large invoice line**. Sample limits are 200,000 rows and 1,024 note
characters per row; they do not implement server pagination.

A headless Chromium run in the development environment rendered this example
in about 2.2 seconds, with 886 preview DOM elements on both the first and last
pages and one API call. The longest observed main-thread task was 307 ms.
These are a development baseline, not a cross-device performance guarantee.

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

Entity and endpoint graphs also include visible external services. Entity schemas
are scoped to their own documents; identically named models remain separate,
and explicit cross-API mappings produce arrows between the relevant services.

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

## Search an entire response

Open **Search entire response** above Preview and type an ID, field name or value.
Search covers the complete JSON response, including collapsed objects and all
Preview pages. Choose keys, values or both, with optional case sensitivity and
exact matching. Terms are literal text (up to 200 characters); numbers, booleans
and null use their JSON spelling. Each matching location appears once, even when
both its key and value match or its value contains repeated occurrences.

Results include a JSON path and a short excerpt. They are paginated in groups of
25 without a total-results cap. **Show match**, **Previous match** and **Next
match** open the necessary Preview pages and highlight the field. Long strings
jump to their matching text page. For paths deeper than 32 levels, Preview shows
the containing object with a **Back to full response** action.

Where Necto mappings identify a containing object, **Select object** fills the
related request fields using that object. Finding or showing a match does not
change the selected object or send a request. Clearing a search preserves the
selection.

Search runs in a dedicated Web Worker. It parses a private copy of the response
once, then reuses it across queries and result pages. Only one page of result
paths and excerpts is retained; the total is counted across the whole response.
This uses additional memory for the raw text transfer and parsed copy; it does
not make arbitrarily large payloads free to hold in memory. Clear or cancel the
search, replace the response, or leave the view to terminate the worker. Search
never refetches the response or changes API pagination. Browsers without worker
support retain Preview, Raw and download, and display a search error.
