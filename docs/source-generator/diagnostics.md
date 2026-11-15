# Generator diagnostics

The generator reports actionable source locations without changing mapping rules:

| ID | Default | Meaning |
| --- | --- | --- |
| NECTO001 | Warning | Missing/nonconstant/empty WithName in the same fluent registration chain |
| NECTO002 | Warning | Duplicate operation IDs; these endpoints are excluded as before |
| NECTO003 | Warning | Multiple source response paths can fill one target input |
| NECTO004 | Info | Indirect handler or opaque IResult cannot be inspected fully |

Use dedicated identifier types or EndpointValue keys to resolve accidental matches; inspect the response paths before deciding. Ambiguous suggestions remain available for manual selection; warnings do not invent business rules or arbitrarily discard a value. Warnings can be configured using standard `.editorconfig`, for example `dotnet_diagnostic.NECTO003.severity = error` for a stricter project.

Only supported ASP.NET Core MapGet/MapPost/MapPut/MapPatch/MapDelete/MapMethods registrations are inspected. This is not an exhaustive linter for every framework or serialization customization. Diagnostics are deterministic and do not expose request data.

Validation: six Roslyn fixture tests cover absent/dynamic/constant names, duplicate exclusion and source locations, ambiguous fields and opaque IResult; 29 existing .NET Release integration tests pass. Generator.Tests is included in Necto.slnx. Analyzer rule release tracking is enabled.
