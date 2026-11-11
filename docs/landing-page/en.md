# Necto

## Your next API call starts with this response.

An OpenAPI UI for ASP.NET Core that connects response values to the requests that can use them.

Browse your endpoints, send a request, and continue with data from its response. Necto helps you follow a workflow through your API, with reusable request presets and suggestions informed by your C# code.

**Explore the code** → [GitHub](https://github.com/nilphilus/necto)

**Try the samples** → [Getting started](../../README.md)

## APIs are connected. Exploring them should be, too.

A customer leads to an asset. An asset leads to an invoice. An invoice leads to its line items.

Exploring that flow often means copying an ID, finding another endpoint, pasting the value, and filling in the same tenant or customer context again. The API already has relationships, but you still have to carry them between requests yourself.

Necto brings those relationships into the API workspace. With endpoint mappings configured, it suggests where response values can go next and lets you use them in the next request.

## From a response to the next request

1. **Send a request.** Browse operations from your OpenAPI document and provide their parameters or JSON body.
2. **See where the data can go.** Necto reads endpoint mappings and shows related operations and reusable values under **Continue from this response**.
3. **Carry a value forward.** Open a related request with a mapped value filled in. Eligible GET and HEAD requests can be sent directly when their required inputs are available.
4. **Follow the chain.** Each related request becomes a new step. Return to an earlier response using the breadcrumbs and continue along another branch.

For example: list invoices, use an invoice ID to fetch its lines, then use a line ID to open its details.

## Connections informed by your code

OpenAPI describes the operations. Necto adds suggestions about how data can move between them.

Its Roslyn source generator examines supported ASP.NET Core Minimal API registrations at build time. It matches response fields to request inputs using dedicated identifier types, identifier names, or explicit `[EndpointValue("...")]` keys. Matching still requires compatible CLR types.

Your application exposes the generated mappings alongside its OpenAPI document. Necto UI resolves those mappings against the available operations before offering suggestions. You can also supply explicit mappings, as demonstrated by the FastEndpoints sample.

These are suggestions for reusing values, not a declaration that one endpoint must always follow another. You choose which request to send.

## Keep the context. Change the request.

Save recurring headers, path values, and query values as named presets. Combine a tenant preset with a customer or asset preset, then use call-flow overrides for values specific to the current workflow.

Presets and overrides supply matching request inputs as you move through related operations. The browser saves presets locally for the configured OpenAPI URL.

## What you can do today

- **Explore an OpenAPI document.** Search endpoints, browse groups by tag, and switch between operation names and paths.
- **Run requests in the same workspace.** Fill path, query, and header parameters or a JSON request body; inspect the response status, elapsed time, and body.
- **Reuse response values.** Apply mapped values to request parameters or JSON body fields, including dedicated identifier types.
- **Navigate request chains.** Keep earlier steps available through breadcrumbs and explore a different continuation.
- **Compose request context.** Combine named presets and apply overrides for a specific call-flow.
- **Keep the UI with your API.** Necto embeds the compiled frontend in the .NET package and serves it from your ASP.NET Core application.

## Start with the API you already have

For an application referencing Necto and using ASP.NET Core OpenAPI:

```csharp
using Necto;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapNectoEndpointMappings();
    app.UseNectoUI(endpointMappingsPath: "/necto/endpoint-mappings");
}

// Register your endpoints with stable .WithName(...) operation IDs.

app.Run();
```

Open `/necto/` to explore your API. The default OpenAPI URL is `/openapi/v1.json`; the UI route and document URL are configurable.

The repository includes Minimal API and FastEndpoints samples with customer, asset, and invoice flows. Applications using the packaged UI do not need a separate frontend build; building Necto from source requires Node.js and pnpm.

**Read the setup guide** → [Necto UI](../../Necto.UI/README.md)

**Explore Necto** → [GitHub](https://github.com/nilphilus/necto)
