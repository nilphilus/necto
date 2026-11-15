# Diagnose incomplete navigation contracts

The existing generator diagnostics now include:

| Rule | Severity | Meaning |
|---|---|---|
| NECTO005 | Warning | The same explicit EndpointValue key uses incompatible CLR types; align types or choose separate logical keys. |
| NECTO006 | Info | A known paged wrapper has zero or multiple visible collection members; explicitly declare the intended collection. |
| NECTO007 | Warning | A wrapper/relation declaration targets a missing, ignored, noncollection or type-incompatible member. |

Diagnostics point to source registrations or attributes. They never guess a database relationship or invent a mapping to suppress a warning. Existing operation-name, duplicate-ID, ambiguity and opaque-handler diagnostics remain. Duplicate operation IDs are excluded from cross-endpoint type checks. A compatible logical key produces no warning.

Use standard `.editorconfig` severity settings to adjust a rule for an intentional contract. Wrapper/relation attributes are supplied by their respective optional features; the diagnostic implementation also understands them when those features are installed together.
