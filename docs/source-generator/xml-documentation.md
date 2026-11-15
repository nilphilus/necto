# Source XML comments as OpenAPI documentation

Opt in with `builder.Services.AddOpenApi(options => options.AddNectoGeneratedDocumentation())`.
The generator reads comments from directly referenced handlers and reachable source DTO types, including named async/typed-result wrappers. A schema/document transformer fills missing summaries, remarks, parameter/body descriptions, type descriptions and property descriptions. Existing nonblank author content wins. JsonTypeInfo supplies actual wire property names, so JsonPropertyName is respected and ignored properties are not added back.

`summary` becomes the operation summary; `remarks` becomes its description. Type/property summary and remarks are combined. Basic XML paragraphs, inline code and references are converted to readable Markdown. Source `///` comments also work when XML-file generation is disabled. No duplicate handwritten document is needed, and the result is ordinary OpenAPI consumed by Necto or other tools.

This is a fallback, not a full XML-doc processor: unresolved inheritdoc and comments outside reachable source symbols are not fabricated. Indirect handlers and runtime-only serializer metadata may not be discoverable. Malformed XML is ignored. Business data, credentials and endpoint execution are not involved.

Validation: 31 .NET Release tests, including real source comments with XML-file generation disabled, named handler/body docs, a renamed JSON property and preservation of explicit WithSummary/WithDescription. Embedded UI build passed.
