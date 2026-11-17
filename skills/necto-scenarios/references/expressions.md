# Isolated expressions (Builder version 6)

An expression is an input source for a transport field or a JSON body value. It does not conditionally skip steps or execute HTTP requests.

```json
{
  "location": "body",
  "pointer": "/action",
  "source": "expression",
  "expression": "switch (invoice.status) { case \"draft\": return \"review\"; case \"approved\": return \"send\"; default: return \"skip\"; }",
  "bindings": [
    {"name": "invoice", "source": "response", "stepId": "read-invoice", "responsePointer": ""}
  ]
}
```

Each binding has a unique JavaScript identifier `name` (maximum 64 characters) and either:

- `source: "response"`, `stepId`, `responsePointer` (empty means whole JSON response).
- `source: "variable"`, `variableId` (static, generated, human or response variable).

No implicit `steps`, `variables`, globals or environment objects exist. Multiple producers create a join automatically, including response variables. Human variables require human-in-the-loop. Responses are read only after their producer succeeds. Each expression is evaluated once before its request; polling reuses the result. Presets override matching inputs without evaluating their expressions. Definitions still must be valid.

Supported: `return`, `const`, blocks, `if/else`, `switch/case/default/break`, JSON literals, arrays, objects, own property/index access, array/string `length`, `?:`, `&&`, `||`, `??`, `!`, numeric unary `+`/`-`, `+ - * / %`, `=== !== < <= > >=`. Arithmetic requires numbers; concatenation requires two strings; relational operands must both be numbers or strings. Missing own properties produce undefined, which can be handled with `??`; undefined cannot be returned. There is no implicit object coercion. A return value is required.

Unsupported: calls and methods (including `map`, `JSON.stringify`, `Math`), functions, constructors, imports, loops, assignments, spread, templates, regular-expression literals, BigInt, async, optional chaining, destructuring, prototype access. Do not emit unsupported syntax and do not attempt workarounds. For simple transformations, return a new object with selected fields or use indexed values whose selection is justified by the API contract.

Limits: 4,096 source characters; 512 AST nodes; 32 levels; 16 bindings; 2,500 interpreter instructions; 10,000 data values; 1 MiB estimated selected input data and 64 KiB estimated output. Size accounting is conservative. No host JavaScript evaluation occurs. Inputs/outputs are detached JSON; dangerous prototype keys and non-JSON values fail. Parsing checks all branches before execution.

Code and literals are saved verbatim. The interpreter's isolation prevents host access; it is not a secret scanner. Expressions targeting marked sensitive fields cannot be shared through folder export. Never embed credentials or sensitive comparisons in code. Imported scenarios still require a review before execution: expressions can transform response values into outgoing requests, just like ordinary bindings.

To test a snippet offline with the installed skill (Node 22+):

```javascript
import { evaluateExpression } from './scripts/lib/blueprint.mjs'
const result = evaluateExpression('return invoice.total > 100 ? "review" : "auto";', {invoice: {total: 150}})
```

This does not call the API. The file validator validates syntax/graph only; it does not execute expressions or verify their business logic.

Scenario-wide authoring limits: at most 100 expressions, 65,536 source characters and 256 selected bindings. These bound preflight work across the whole graph as well as individual evaluations.
