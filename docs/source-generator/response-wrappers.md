# Response wrappers

Enable `options.AddNectoGeneratedWrappers()` in `AddOpenApi`. The generator recognizes unambiguous `PagedResult<T>`, `PagedResponse<T>` and `PageResult<T>` models with one collection. Other wrappers can use `[NectoResponseCollection(nameof(Items), TotalCountProperty = nameof(TotalCount))]`.

Runtime JSON metadata supplies actual serialized property names. Ambiguous wrappers, ignored members and custom converters are not guessed. The OpenAPI schema receives `x-necto-collection` and optional `x-necto-total-count`; authored extensions win. Necto starts Preview at that collection, retaining full JSON paths for selection and offering Back to full response. API totals remain separate from local Preview pagination. No payload is changed or API call added.
