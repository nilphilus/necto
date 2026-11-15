# Publish generated mappings as OpenAPI Links

Opt in while registering OpenAPI:

```csharp
builder.Services.AddOpenApi(options => options.AddNectoGeneratedLinks());
```

The generated extension passes its compile-time mapping table to an OpenAPI document transformer. No business endpoint is called. For each declared 2xx response, the transformer verifies a JSON schema path and a unique target operation/parameter before adding a standard Link. Local `$ref` schemas and JSON Pointer escaping are supported. Re-running the transformer is idempotent.

Existing author Links targeting the same operation and existing keys are preserved. Ambiguous sources, array wildcards, partial body assignments, cross-API IDs, unavailable operations and unverified schema paths are skipped rather than guessed. A whole request body can be linked; individual body fields cannot be represented by this transformation. Mappings that cannot be promoted remain available through the regular Necto mapping endpoint.

This publishes a possible transition, not a business prerequisite or automatic execution order. Other OpenAPI tools may choose not to render Links.

Validation: 31 .NET Release tests, including actual generated OpenAPI, array omission, author-link preservation, ambiguity rejection and idempotence. UI assets built as part of the .NET build.
