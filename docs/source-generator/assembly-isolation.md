# Generated code in referenced projects

Generated implementation types and extension methods now use deterministic, assembly-specific namespaces. The generator adds local global imports, so existing calls such as `app.UseNectoUI()`, `app.MapNectoEndpointMappings().WithMetadata(...)`, and `options.AddNectoGeneratedLinks()` do not need to change. Imports do not propagate through project references.

This fixes CS0436 type conflicts and CS0121 ambiguous calls when another assembly exposes its generated internals through InternalsVisibleTo. It also covers libraries with no endpoint registrations. The assembly-level mappings provider stays discoverable through NectoMappingsAttribute; its registration uses a direct static call instead of extension lookup.

Keep all projects on the same updated generator/package version. After updating, clean stale compiler-generated output and rebuild. For an immediate workaround on an older package, a library that contains only models/attributes and does not need generated registrations can exclude the package's analyzer assets; keep the analyzer enabled in the API project. Do not exclude it from a library that relies on its generated registration methods.

Tests compile a real referenced friend assembly and a consumer with warnings treated as errors, invoke every available generated extension family, and verify runtime attribute discovery plus deterministic output. Generated implementation type names/namespaces are compiler details, not a public API.
