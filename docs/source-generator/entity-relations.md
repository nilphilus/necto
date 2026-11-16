# Explain entity relations

The existing generated entity catalog now includes relation evidence. In Entity graph → Models and identifiers, select a model to see why a property points to another model, then Explore the target to see its available endpoints.

A relation is inferred only when a dedicated identifier type matches exactly one other model's Id. Primitive `int CustomerId` is not treated as proof. For explicit contracts use `[NectoRelation(typeof(Customer), nameof(Customer.Id))]` on a JSON property; source/target types must match and the target must be JSON-visible. Ignored/converter-backed fields and ambiguous typed-ID destinations are not guessed. The declaration describes an API contract relation, not an enforced database foreign key.

No new endpoint is needed: register `MapNectoEntityCatalog()` with the host's existing authorization policy.
