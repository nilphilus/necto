# Make a verified relationship visible in Necto

Use `[EndpointValue("LogicalKey")]` from the `Necto` namespace when a response value and a later request input represent the same business identifier but have different names. Use the same stable key on both sides and compatible CLR types. Reuse a key only for the same meaning and scope. Verify this in DTOs, route bindings and handler or service code. Matching names, types or sample numbers alone are insufficient.

## Minimal API example

The first response returns a legacy invoice number. The second endpoint binds it from a route parameter called `number`. The application already defines `FindInvoice` and `FindByLegacyNumber`.

```csharp
using Necto;

// In the endpoint registration code:
app.MapGet("/invoices/{id}", (int id) => FindInvoice(id))
    .WithName("GetInvoice");
app.MapGet("/invoices/by-legacy-number/{number}",
    ([EndpointValue("LegacyInvoice")] int number) => FindByLegacyNumber(number))
    .WithName("GetInvoiceByLegacyNumber");

// FindInvoice returns InvoiceResponse (or a supported typed result containing it).
public sealed record InvoiceResponse(
    [property: EndpointValue("LegacyInvoice")] int LegacyNumber);
```

On a regular DTO property, use `[EndpointValue("LegacyInvoice")]` directly. On the input DTO of a FastEndpoints endpoint, use it on the property bound to the request, and use the same key on the response property. Keep the framework's existing route/query/header binding attributes and JSON names. For positional records, use the `property:` target. In Minimal APIs, keep constant `.WithName(...)` values in the same fluent chain. In FastEndpoints, verify registered route names agree with OpenAPI operation IDs.

## Agent workflow

1. Confirm the producer and consumer use the same value, including tenant scope, cardinality and any eligibility rules. Inspect the actual response JSON path and request binding. Prefer an applicable existing OpenAPI Link or mapping before proposing a new attribute.
2. For scenario-only work, use a verified ordinary Builder response binding and report the exact proposed annotations separately. When asked to make the relationship discoverable in Necto, apply the smallest annotation change in the API source and keep serialized names and binding locations intact.
3. Build the affected API project. When metadata is available, check `necto_get_relationships` or the application's configured endpoint mappings URL. Confirm the source and target operation IDs, JSON path and target binding, and check for unintended matches introduced by the shared key. Report whether the build and mapping verification were performed. Do not execute business requests just to verify metadata.

The attribute identifies compatible values. It cannot transform incompatible types, pick an array item, enforce tenant scope, or resolve custom serialization that the generator cannot inspect. Use an explicit mapping or OpenAPI Link for supported relations outside attribute inference. Keep a scenario-level binding or expression when the relationship is specific to that workflow.
