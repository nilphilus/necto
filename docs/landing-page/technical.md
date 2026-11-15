# How Necto works

[Product overview](en.md) · [Rendered technical guide](technical.html)

## Quickstart

The current package targets .NET 10. Install the package in your ASP.NET Core application:

```sh
dotnet add package Necto.OpenApi
```

### Existing application

Keep your existing OpenAPI service and document registrations. Add only the missing Necto registrations after `builder.Build()`:

```csharp
app.MapNectoEndpointMappings();
app.UseNectoUI();
```

Register each route once. `MapNectoEndpointMappings()` exposes relationship metadata; `UseNectoUI()` serves the workspace. They work together. `MapOpenApi()` serves the OpenAPI document: keep your existing call rather than adding another for the same document route. If that route differs from `/openapi/v1.json`, pass it as `openApiPath`.

`MapNectoUI()` is an alternative to `UseNectoUI()` when you need endpoint conventions such as `.RequireAuthorization()`. Use one of them for a given UI path.

### New application

This complete `Program.cs` replaces the corresponding setup; do not append it to the existing application's registrations:

```csharp
using Necto;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
var app = builder.Build();

// Register your endpoints here.

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapNectoEndpointMappings();
    app.UseNectoUI();
}

app.Run();
```

Open `/necto/`. The compiled Vue frontend is embedded in the .NET assembly; consumers need no separate frontend build or deployment. Use `openApiPath` for another document route. A single registered generated mappings route is discovered automatically; custom or multiple routes require `endpointMappingsPath`.

The gallery shows current main. Published NuGet releases may have an earlier UI; run the samples from the repository for the latest changes.

## Connections

1. OpenAPI supplies operations, input fields, schemas and responses.
2. A Roslyn source generator emits response-to-request value mappings during compilation.
3. The UI resolves those mappings against OpenAPI and offers related requests.

Rules use dedicated CLR identifier types, supported scalar field names with compatible types, or `[EndpointValue("…")]` keys. `Invoice.Id` can supply `invoiceId`; `Invoice.Reference` can match `reference` or `invoiceReference`.

Automatic generation currently supports Minimal API registrations with a constant `.WithName("…")` in the same fluent chain. Nested objects/arrays and JSON property names are supported. Traversal stops at repeated types and has a 16-segment limit. Custom JSON converters are opaque. Other integrations can provide explicit mappings; the FastEndpoints sample does this.

Selection fills matching inputs without adding metadata to business responses. Values stay editable. Related GET/HEAD requests with valid inputs can be sent directly; writes open in the editor. Mappings describe compatible values, not inferred business rules or guaranteed success.

## Scenarios

Saved requests retain inputs for one endpoint; presets supply shared values; scenarios retain a chain and response bindings. Replay runs sequentially and resolves those values from fresh responses. Array selection is positional; reordering may select another item. Missing values, HTTP errors and network failures stop later steps.

Saved configurations live in browser storage; run results remain in workspace memory. Writes run only when explicitly executed. See the [scenario guide](../../Necto.UI/README.md#saved-scenarios) for storage and execution details.

## Large responses

Preview renders arrays and objects in local pages of 25 entries. Page changes do not call the API or modify its pagination. Whole-response search runs in a worker and can reveal mapped objects on other pages. Long strings and raw text are paged; downloading saves the full original text.

Large JSON is parsed in a background worker. The full response and parsed JSON still occupy browser memory: pagination bounds rendering, not download size or memory use. Device, browser and payload shape affect performance. See [limits and measurements](../../Necto.UI/README.md#large-responses).

## Graphs

The entity graph explores OpenAPI models and their associated operations. The endpoint graph explores response-to-request mappings. Both allow inspection and opening requests. They describe available metadata, not observed runtime traffic.

## External APIs

Add OpenAPI documents and Necto mappings in Settings. Each API keeps scoped operation identities and request URLs. Explicit API-scoped mappings can carry values across services. Cross-origin metadata and requests require appropriate API CORS configuration; sharing presets is opt-in. See the [external API guide](../../Necto.UI/README.md#external-apis).

## Agent

The optional MCP bridge shares the visible API catalog, types and relationships, queues prompts, and displays progress/results reported by the connected agent. The agent needs its own model, HTTP tools and API credentials. Necto does not start an arbitrary agent or execute HTTP requests through the bridge.

```csharp
app.MapNectoAgent();
// Replace the existing UseNectoUI() call with this one:
app.UseNectoUI(agentPath: "/necto/agent");
```

See [MCP setup and task ownership](../bring-your-agent/README.md).

## Hosting

The quickstart enables Necto in Development. For other environments, configure UI/bridge access through the host application's authentication and endpoint policies. API authorization and CORS still govern requests. Building Necto from source requires the .NET SDK, Node.js and pnpm; using the package requires no frontend toolchain.

[Full integration guide](../../Necto.UI/README.md) · [License, including Commons Clause](../../LICENSE.txt)
