# Generated field constraints

Enable `options.AddNectoGeneratedConstraints()` in AddOpenApi. Compile-time metadata covers Required, Range (numeric bounds), StringLength, MinLength, MaxLength, EmailAddress, Url and RegularExpression on JSON-visible DTO properties. Runtime serializer metadata resolves the actual wire names. Existing OpenAPI constraints win; ignored and custom-converted members are not reinterpreted.

Constraints appear in the existing on-demand Contract model details. Patterns are displayed as text, never executed by Necto. This supplements the host's existing OpenAPI support; many standard annotations already appear without Necto. It does not infer FluentValidation rules, database-dependent requirements or arbitrary custom validators, and does not replace server validation.
