# Pick random — Builder version 7

Choose one element from an earlier JSON response array and optionally a field within that element. Only use this when the user wants a random eligible record; do not use it to guess which customer/invoice belongs to a business operation.

```json
{
  "location": "path",
  "name": "invoiceId",
  "source": "random",
  "stepId": "list-invoices",
  "responsePointer": "/items",
  "itemPointer": "/id"
}
```

`responsePointer` identifies the array (empty for a root array). `itemPointer` is relative to the chosen item (empty for the entire item). Both are JSON Pointers, with the same escaping and safety limits as ordinary response bindings. Values retain their JSON type. Select a compatible target type; an entire object usually belongs in a body, not an integer path parameter.

The producer is an automatic graph dependency. Selection happens after the producer's final successful response, once before the consumer request. Polling retries reuse the chosen value. A matching preset overrides the input without selecting anything. Each separate random input selects independently; the same item may be selected more than once. There is no uniqueness guarantee, persistent seed or cross-run replay.

## Reuse one selected record

Add a shared variable:

```json
{
  "id": "selected-invoice",
  "name": "selectedInvoice",
  "source": "random",
  "stepId": "list-invoices",
  "responsePointer": "/items",
  "itemPointer": ""
}
```

Use `source: "variable", variableId: "selected-invoice"` for the whole selected record, or bind that variable to an expression alias and return `invoice.id` / `invoice.reference` in separate fields. The variable is resolved once per run, including parallel consumers. It creates the producer dependency even through expression bindings. Selected data is not stored in the scenario definition.

Empty arrays, non-array values, missing paths or missing selected fields stop the consumer before its request. There is no fallback to index zero or a static value. Root arrays of primitives are supported with empty `itemPointer`. Sampling uses browser crypto with bounded rejection sampling, not host access from expressions; no new JavaScript capabilities are introduced. If crypto is unavailable, the run fails rather than using an insecure fallback.

See [the complete SampleApi file](../examples/random-invoice.necto.json). It lists invoices, chooses one `id` for the lines endpoint, and keeps the optional weather branch independent. Verify operation identities and eligibility against the target project before adapting it.
