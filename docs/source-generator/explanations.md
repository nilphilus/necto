# Why is this request related?

Generated mappings include optional `evidence`: CLR source/target types, convention names and the logical EndpointValue key when present. Legacy mappings remain valid and the four-argument constructor is unchanged.

The existing information button beside a related request explains whether the match used a dedicated identifier type, an explicit attribute or a naming convention. Name matches are labeled suggestions, not business guarantees. No permanent panel is added; declared OpenAPI Links still come first.

Validation: 30 .NET Release tests, 186 UI/module tests. The integration test reads actual generated mappings for all three rules. Older mapping JSON without evidence is covered by the existing suite.
