# Necto shared Builder format

The outer object is `{ "format": "necto-shared-scenario", "version": 1, "kind": "builder", "scenario": BLUEPRINT }`.

Blueprint: `format: "necto-scenario-builder"`, `version: 7`, stable nonempty `id`, `name` (1–200 characters), optional plain-text `description` (up to 500 characters, shown in the scenario library), `concurrency` (1–8), `variables: []`, `connections: []`, `steps: []` (maximum 100).

Each step requires:

```json
{
  "id": "read-invoice",
  "label": "Read selected invoice",
  "operationKey": "GET /invoices/by-reference",
  "apiId": "local",
  "method": "GET",
  "path": "/invoices/by-reference",
  "dependsOn": [],
  "inputs": [],
  "request": {"fields": {}, "body": "", "assertions": [], "timeout": 30000, "responseLimitMiB": 32}
}
```

Static transport fields are string values under `path:name`, `query:name`, `header:name`. Copy `name` exactly from the resolved OpenAPI parameter, also in dynamic `inputs[].name`. For example, an OpenAPI query parameter `Type` is stored under `query:Type`. A JSON request body is a **JSON string**, not an object. Set `mediaType: "application/json"` when needed. `serverIndex` and `serverValues` are optional; use only verified server choices. Never store auth headers or browser execution state. File attachments must be supplied in the browser.

## Inputs

Active presets apply to matching fields at run time. Set the step's optional `ignorePresets: true` only when the user wants that step to use its own inputs regardless of preset selection.

Each input targets `location: "path"|"query"|"header"` plus `name`, or `location: "body"` plus `pointer`. JSON Pointer uses `/field`, `/items/0/id`; escape `~` as `~0` and `/` as `~1`. Empty pointer means the whole body/response. Array target elements must already exist. Input targets must not overlap. Copy JSON property names exactly from the selected OpenAPI media type and schema. If the schema declares `Type`, write `"Type"` in the saved body and `/Type` in target pointers, including through nested array items. Use the source response schema for source pointers. JSON keys such as `abc` and `ABC` are distinct.

Add one source:

| Source | Additional fields |
| --- | --- |
| `response` | `stepId`, `responsePointer` |
| `human` | `prompt`, `valueType: "text"|"number"|"boolean"|"json"` |
| `generate` | `generator`, plus `pattern` for regex |
| `variable` | `variableId` |
| `random` | `stepId`, `responsePointer` (array), `itemPointer` (selected value); [details](random.md) |
| `expression` | `expression` (code) and `bindings`; see [expression reference](expressions.md) |
| `preset` | legacy source; matches a named field from the globally active presets. For new steps, leave the field available for active presets and supply a static or dynamic fallback when appropriate. |

Preset cannot target the whole body. A response input creates a dependency automatically; explicit connections can additionally make ordering and timing clear. Response-sourced variables also create dependencies. Avoid cycles.

Supported generators: `uuid`, `firstName`, `lastName`, `fullName`, `email`, `username`, `company`, `city`, `countryCode`, `integer` (0–1000), `boolean`, `date`, `regex`. Regex supports literals, classes, `\\d`, `\\w`, `\\s`, `?`, bounded `{n}`/`{min,max}` (counts ≤32); no groups, alternation or unbounded repetition. Example JSON pattern: `"INV-[A-Z]{3}-[0-9]{4}"`.

Variables require unique `id`, case-insensitively unique `name` (`[A-Za-z_][A-Za-z0-9_]{0,63}`), and a source:

- `static`: `valueType` and string `value` (JSON-encoded for number/boolean/json).
- `human`: `valueType` and `prompt`.
- `generate`: `generator` and optional regex `pattern`.
- `response`: `stepId` and `responsePointer`.
- `random`: `stepId`, `responsePointer` and `itemPointer`; pick once per run for all consumers.

Variables are evaluated once per run; a generated step input is per step. Prefer human input over a static secret.

## Connections and polling

`{ "from": "producer-id", "to": "consumer-id" }`. Independent roots need no connection; `from: null` denotes Start when timing is needed. `dependsOn` stays empty in version 7.

```json
{
  "from": "create-job",
  "to": "poll-job",
  "delayMs": 500,
  "waitFor": {"pointer": "/status", "valueType": "text", "value": "ready", "retryCount": 5, "intervalMs": 1000}
}
```

The example retries **poll-job**, not create-job. Wait conditions inspect the target response. `delayMs`: 0–600000; `retryCount`: 0–100 retries after the first call; `intervalMs`: 100–600000. Polling needs JSON. Put a single wait condition on an incoming edge to avoid ambiguous configuration. Joins wait for all dependencies. Layout positions are optional (`x`,`y`: 20–20000).

## Response checks

`request.assertions` supports:

- `{"kind":"status","expected":"200"}`
- `{"kind":"exists","path":"/id"}`
- `{"kind":"nonempty","path":"/items"}`
- `{"kind":"equals","path":"/status","expected":"\"ready\""}` — expected is JSON text.
- `{"kind":"duration","expected":"2000"}` — milliseconds.

Maximum 50 checks per request. Do not retain sensitive expected values. Non-JSON responses cannot provide JSON Pointer bindings/checks.

## Validation scope

The packaged validator uses Necto's actual version-7 model validator, with outer file checks (2 MiB, 25,000 values, 64 levels, including embedded JSON). It rejects invalid graphs, inputs, generators, waits and variables. It is intentionally Builder-only. Necto remains the final import/runtime authority; future formats may require an updated skill. API identity, schema/business compatibility, authorization and secret review require the discovery steps in SKILL.md.

## Local computation steps

A local step evaluates one `random` or `expression` input once per run and
publishes the JSON result without issuing an HTTP request. Give the step
`"method": "LOCAL"`, `"operationKey": ""`, `"apiId": "local"`, and `"path": ""`.
Use `"request": {"fields": {}, "body": ""}` and one input with
`"location": "body"` and `"pointer": ""`. The input’s source and binding keys are
the same as for a random pick or expression in a request.

Use the local step’s ID as a downstream response binding’s `stepId`. An empty
`responsePointer` gives the whole result. When the result is a record, use a
pointer such as `/id` to extract one field. Independent consumers can run in
parallel. A local step can be delayed, and HTTP polling applies only to
request steps.
