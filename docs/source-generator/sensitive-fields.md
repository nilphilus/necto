# Sensitive DTO fields

Mark a JSON property with `[NectoSensitive]`, then enable `options.AddNectoGeneratedSensitiveFields()` in AddOpenApi. Generated metadata resolves actual wire names and publishes `x-necto-sensitive-properties` on the containing schema. Authored and generated sensitivity declarations are combined conservatively.

With that metadata loaded, Necto omits marked properties from newly saved JSON request bodies/scenarios and default snippets, masks them in retained response history, and sanitizes scenario bodies for CI exports. Nested objects, arrays, schema references and composed schemas are supported. Forms omit marked top-level rows. A marked string containing XML is removed as a whole; its XML is not parsed for redaction. Generated value mappings do not offer marked fields. Contract model details explain the retention flag.

The live API response and request sent by the user are unchanged. This is a retention policy, not a serializer/security boundary: it does not stop the server returning a field or hide it from a user inspecting the live response. Use Authorize for credentials. Existing saved files/storage, arbitrary documentation examples/prose, custom mappings and other clients are not retroactively cleaned; reopen/resave old requests after loading the updated metadata. An unavailable or stale document cannot communicate new annotations. Do not put credentials into presets or documentation examples.

Retention traversal is bounded and fails closed for oversized/deep annotated bodies rather than saving a partial request. Custom-converted whole DTOs cannot safely expose property metadata and are not inferred. This does not replace application authorization, data classification or server-side redaction.

Whole-object/typed-identifier mappings are also excluded when the value contains a marked member. The mapping eligibility scan is bounded and fails closed when it cannot safely classify a complex value.
