# Access requirement hints

Enable `options.AddNectoGeneratedAccessHints()` in AddOpenApi. The generator records standard method-level Authorize/AllowAnonymous declarations for named Minimal API operations. When OpenAPI is built, final endpoint metadata supplies group/route conventions and runtime policy presence; AllowAnonymous wins. A configured fallback policy is reported as runtime policy without pretending to evaluate its requirements.

Contract → Access requirements explains policies, authentication schemes and roles. Roles within one rule are alternatives; separate rules are cumulative. This metadata does not grant access, verify a user's permissions, infer gateway checks or replace host authorization. Existing authored `x-necto-access` metadata is preserved. Policy names are documentation: protect the OpenAPI document appropriately.

Final endpoint metadata is authoritative when available, including conventions that explicitly remove method-level declarations. Compile-time declarations are only a fallback for descriptions without runtime endpoint metadata.
