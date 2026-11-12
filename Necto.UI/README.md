# Necto UI

Necto UI is a Vue application for browsing and running the operations in an OpenAPI JSON document. The Necto NuGet package includes the compiled frontend in its assembly.

Browse collapsible groups by tag and switch the sidebar between operation names and paths. Selecting an endpoint in the sidebar opens its request and response page and starts a separate chain. Send with the button or with Ctrl+Enter (⌘+Enter on macOS) while focused in the operation's workspace. Drafts and responses from direct sidebar visits stay available when you revisit those endpoints.

When endpoint mappings are configured, **Continue from this response** shows related operations and values. Each related request has editable fields with dropdown suggestions from the response. Type to filter the suggestions, choose a value, or enter a value that is not listed. Use **Send** for GET/HEAD requests with complete valid inputs. **Open request** is always available, including POST/PUT/PATCH/DELETE and incomplete requests; it opens an editable form with the selected values without sending a request. Request parameter inputs offer the same suggestions. Each related request gets its own step in the breadcrumb trail. Select an earlier step to restore its request and response and continue along another branch.

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

Response data is shown before continuation forms. On wide request panels, **Next request** sits alongside Preview so selecting an object and following a request stay in view together. On narrower panels it follows the response and can be collapsed. Requests without mappings use the full response width.

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

## Saved scenarios

Build a request chain using **Continue from this response**, then open
**Save scenario** next to the request breadcrumbs, enter a name, and choose **Save current
chain**. Browse saved chains in the **Scenarios** workspace. Scenarios are stored locally in the browser, scoped to the host OpenAPI
URL. A scenario can contain up to 100 steps.

Values selected through related requests or response suggestions from an earlier
step are recorded as response selectors. For example, selecting the second
invoice line records `$[1]["lineId"]`, rather than the line ID received today.
Each replay sends fresh requests and reads that position from the new response.
Array selection is positional: changed ordering can select a different object;
a missing item or field stops the run. Values taken from unrelated response
history outside the current chain are saved as literal inputs instead.

Use **Review steps** to inspect operations, API IDs and bindings before running.
**Open** loads a saved chain without sending requests. Select a step through its
breadcrumbs or the scenario step list, edit its inputs, then **Update scenario**.
Other steps and their response bindings are preserved. Changing a bound field
manually to another value makes it a literal on save. Enter a different scenario
name to save a separate copy. Response-bound inputs in a newly opened scenario
remain empty until the scenario runs. Editing a scenario does not automatically
change its saved definition: save changes before pressing **Run scenario**.

Choose **Run…** in the scenario list to select presets for that run. The active
request presets are preselected and you can clear or change the selection.
Selected presets override matching saved inputs and response bindings for that
run. The last selected preset wins when values overlap. Preset-controlled inputs, values recorded as response bindings, and response
bodies are not copied into scenario storage. Manually entered request inputs, including
JSON bodies, are stored as supplied; request presets are suitable for reusable
authentication values. External API preset opt-in rules still apply.

Before any request is sent, Necto checks operation availability, configured
bindings, required inputs and JSON body syntax. Actual response values are
resolved when the source step finishes. External API steps require a visible, loaded connection. Invalid
or removed mappings stop preflight; no requests are sent in that case. API-side
validation and business rules still apply when the request executes.

Requests run sequentially. The latest run appears under its scenario, with
side-by-side **Request** and **Response** columns for each step. Scroll
horizontally for later steps. Values copied from a response into a later request
share a color. Hover or focus a value to see its connections, or click to keep
them visible while scrolling. HTTP errors, network failures and unavailable
response values stop later steps. Run details are kept in memory for the
current workspace. **Stop scenario**
aborts the active browser request/background parser and prevents later steps;
it cannot undo work already received by the API. Running a scenario explicitly
sends all its configured methods, including POST/PUT/PATCH/DELETE. Nothing runs
automatically when a scenario is saved, opened or restored after reload.

Scenario execution opens in **Steps**: a compact status list and the request/response for one selected step. It follows the running step and ends on the completed, failed or cancelled step. Selecting a step pauses following; **Follow execution** resumes it during a run. Mapped input values link back to their source step. **Open request** inspects the selected step in the API workspace without sending it. **Compare all** retains the horizontal, color-linked trace as an optional view. On phones, step details and request/response sections stack to fit the available width.

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

The **Show external APIs** switch in **Settings → External APIs** controls external catalog
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
Metadata requests always omit cookies and request presets; metadata endpoints must be
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

Active presets are always shown above the API workspace, even when they do not match the current endpoint. Their chips open the selected preset editor or deactivate that preset. Parameter notes identify the winning preset; JSON body overrides can be expanded to inspect field paths and sources. Related requests show effective preset inputs even when a preset replaces their editable field. Header values are hidden in these summaries. External APIs that have not opted into presets show an explicit exclusion note.

Use **Settings → Presets** to add a named preset. Choose **Add field**, enter its name and value, and choose **Save values**.

| Name | Value |
| --- | --- |
| `X-Tenant` | `acme` |
| `customer` | `customer-42` |
| `locale` | `pl-PL` |

Choose presets above the endpoint title in the API view. The selector shows presets that can affect the current endpoint. If you switch endpoints, presets that are hidden keep their selection and activation order. When multiple presets supply the same field, the most recently enabled preset wins for that field. The browser saves the presets and their activation order for this OpenAPI URL in local storage. Existing saved environments appear as presets.

Each entry fills matching header, query, route, and JSON body fields. Exact names take precedence within a preset. Case differences are accepted when the match is unambiguous. Necto keeps the endpoint's parameter spelling. Use JSON text for array or object values. For example, a `customer` entry can fill both `/{customer}/Invoice/{id}` and a JSON property named `customer` in the same request. Previously saved header entries still send their headers when OpenAPI omits them.

Active presets take precedence over the request form and values selected from a related response.

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

The API workspace reserves a preset column only when presets match the current request. On narrow screens, matching presets are available through a **Presets** disclosure above the full-width request, rather than a permanent side column. Desktop expand/collapse remains independent of the mobile panel.

## Bring your agent

When the host enables `MapNectoAgent` and configures `agentPath`, the workspace
includes **Bring your agent**. Create a connection, add its Streamable HTTP MCP
configuration to your agent, give the agent the displayed polling instructions,
and queue a prompt. Progress and results appear in the task panel. Your agent
uses its own HTTP tools and credentials; Necto supplies API metadata and task
coordination. See the [full guide](../docs/bring-your-agent/README.md) for host
configuration, client setup, tools, capability lifetime and execution limits.
