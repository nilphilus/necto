# How Necto works

Necto serves an OpenAPI UI from an ASP.NET Core application. The compiled Vue
frontend is embedded in the .NET package. It reads the configured OpenAPI JSON
document to discover operations and build request forms.

This guide covers the functionality in main plus PR #1 and PR #2, which are
included in the landing page's product scope.

## How connections work

A Roslyn source generator examines supported Minimal API registrations during
compilation. It matches response fields to request inputs using:

- The same dedicated CLR identifier type, such as `CustomerId`.
- Matching identifier names with compatible CLR types.
- Explicit logical keys supplied by `[EndpointValue("...")]`.

Supported registrations have a constant `.WithName(...)` operation ID in the
same fluent chain. Response paths describe nested objects and array items and
honor JSON property names. Recursive traversal stops at repeated types and is
limited to 16 path segments. Custom JSON converters are opaque to the generator.

The application exposes these mappings beside its OpenAPI document. The UI
resolves operation IDs and fields against that document before offering links.
Explicit mappings can also be provided; the FastEndpoints sample uses this
approach. Suggestions describe compatible values, not inferred business rules
or a guarantee that a request will succeed.

## Response selection and request inputs

JSON Preview colors keys and scalar values. Mapped objects have a Select
button. Selecting an object fills matching related-request inputs, including
values from nested arrays. Inputs remain editable and offer native dropdown
suggestions; users can also send values they enter themselves.

Suggestions are bounded to 200 values per mapping. A selection from any Preview
page can supply a value beyond that initial set. Related GET/HEAD requests can
be sent directly when their required inputs are available and valid. Other
requests can be opened in the editor. Breadcrumbs preserve the request chain
so users can return to earlier responses and continue along another path.

## Large response preview

Preview renders arrays and objects in pages of 25 entries. Each nested container
has its own pagination and containers at depth two start collapsed. Array
indices remain absolute, so a selection on a later page refers to the correct
response item. This is entirely local UI pagination: it does not change the
request or require pagination support from the API.

Long strings show 2,000 characters per page. Raw and non-JSON text show 20,000
characters per page. Download response saves the complete original text.

JSON above one million characters is parsed in a Web Worker. The implementation
avoids a second pretty-printed copy and keeps parsed objects outside Vue deep
reactivity. The full response and parsed JSON still occupy browser memory, and
worker-to-main-thread transfer can briefly block the main thread.

One headless Chromium run against the sample endpoint measured:

| Measurement | Result |
| --- | --- |
| Response | 117,200,001 characters, approximately 117 MB |
| Records | 100,000 |
| Time to Preview | Approximately 2.2 seconds |
| Preview DOM elements, first / last page | 886 / 886 |
| API calls while browsing pages | 1 |
| Longest observed main-thread task | 307 ms |

This is a development-environment measurement, not a performance guarantee for
every browser, device, payload shape, or network. The sample endpoint is
`GET /invoices/large-payload?count=100000&noteSize=1024` from PR #2.

## Presets and hosting

Named presets store recurring header, path, and query values. Multiple presets
can be active together; for overlapping fields, the most recently enabled
preset wins. Presets are saved in browser local storage for the configured
OpenAPI URL.

Applications using the packaged UI do not need a separate frontend build.
Building Necto itself from source requires Node.js and pnpm. See the
[setup guide](../../Necto.UI/README.md) and [sample applications](../../README.md)
for configuration and examples.
