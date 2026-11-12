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
