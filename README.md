# Necto

## OpenAPI UI

Call `app.UseNectoUI()` alongside `app.MapOpenApi()` to serve the Vue UI at
`/necto/`. See the [Necto UI guide](Necto.UI/README.md) for configuration and
frontend development.

Both samples expose Necto UI and Scalar in Development. Each UI reads the same
OpenAPI document at `/openapi/v1.json` on its sample API.

| Run from the repository root | Necto UI | Scalar UI |
| --- | --- | --- |
| `dotnet run --project SampleApi` | [Necto](http://localhost:5000/necto/) | [Scalar](http://localhost:5000/scalar/) |
| `dotnet run --project SampleApi.FastEndpoints` | [Necto](http://localhost:5001/necto/) | [Scalar](http://localhost:5001/scalar/) |

## FastEndpoints sample

The API has four groups: Customers,
Assets, Invoices, and Weather. In Necto UI, run `GET /customers` and use a
returned customer ID to filter `GET /assets`. From an asset you can find its
invoices or view the simulated forecast for its installation location. The
sample provides these links through explicit endpoint mappings.

The [HTTP examples](SampleApi.FastEndpoints/SampleApi.FastEndpoints.http)
show the same flow with sample IDs.

Both samples contain 12 invoices and enough line items to try searchable value
suggestions. For example, in SampleApi run `GET /invoices`, type an invoice ID
in the related **Invoice lines** field, or select an invoice in Preview to fill
it automatically. Invoice 42 has 12 lines; the FastEndpoints equivalent is
invoice 501.

## Large payload experiment

Necto provides local Preview pagination.
Run SampleApi and use `GET /invoices/large-payload?count=100000&noteSize=1024`
for a single response above 100 MB. Preview pages contain 25 entries and retain
absolute indices for selecting objects; changing pages does not call the API.
See the [UI guide](Necto.UI/README.md#large-responses) for limits and measurements.

## External API connections

Configure additional OpenAPI documents and Necto mappings in **Settings → External
APIs**, then use **Show external APIs** in the workspace. Services retain their
own request URLs and operation identities. Explicit `source.apiId` / `target.apiId`
selectors allow response values to flow between configured services. See the
[external API guide](Necto.UI/README.md#external-apis) for configuration and CORS.

## Endpoint mappings

Necto generates suggestions for reusing response values in other API requests. The
NuGet package includes a Roslyn source generator. Call
`app.MapNectoEndpointMappings()` to expose the generated suggestions alongside
your OpenAPI document. The default path is `/necto/endpoint-mappings`.
Pass that path as `endpointMappingsPath` to `UseNectoUI` to display the
suggestions next to the target operations.

Each mapping identifies a source and a target by their OpenAPI `operationId`.
`source.eachItem` applies the selector to each element of a response array.
`source.property` is a JSON property name, with `null` selecting the entire
response or array item. `target.location` and `target.name` identify the request
field. For `location: "parameter"`, resolve the location in OpenAPI. For
`location: "body"`, a null name selects the entire JSON body.

- `type` matches the same dedicated CLR identifier type, such as `CustomerId`.
- `name` matches equal simple CLR types by identifier name. For example,
  `Invoice.Id` and `invoiceId` both resolve to `InvoiceId`.
- `attribute` uses a logical key from `[EndpointValue("LegacyInvoice")]`.
  Use the same key on both sides, or use the conventional identifier name as the
  key on one side. The CLR types must still match.

A primitive match can include `suggestedIdentifierType` with a name for a
dedicated type. The UI should resolve the operation IDs and fields against its
active OpenAPI document before offering the suggestions.

The generator currently handles Minimal API registrations with a constant
`.WithName(...)` in the same fluent chain. It reads JSON properties on response objects and nested objects/arrays
under the default ASP.NET Core web naming policy, honors `JsonPropertyName`, and
supports explicit `[FromBody]` models. Recursive response types stop at the first
repeated type on a branch; traversal is limited to 16 path segments. Custom JSON
converters are opaque to the generator.

For nested response fields, `source.objectPath` describes the containing object:
string segments are exact JSON property names and `null` segments select each
array item. For example, `{"objectPath":["invoice-lines",null],"property":"lineId"}`
selects line IDs inside an envelope. When `objectPath` is present it takes
precedence over `eachItem`; when absent, the original root selectors still apply.
The UI uses mappings resolved against OpenAPI to mark selectable objects, without
adding metadata to the API's business responses or requiring another attribute. Use `SampleApi/SampleApi.http` to try all
three match rules.
