# Bounded automatic request examples

Automatic request-body generation shares a budget across every schema branch: 2,000 visited nodes, 24 nesting levels and 128 Ki characters of output. This includes repeated references in noncyclic schema graphs, arrays, union variants, allOf branches and published examples/defaults. Cyclic schema references retain the existing null termination behavior.

When a schema exceeds the budget, Necto leaves the generated body empty and displays an explanation in the body editor. It does not substitute a silently truncated payload. Users may enter a body manually or explicitly choose an example. These limits do not restrict the size of a manually entered body sent without automatic body presets.

Body-preset shape generation uses the same shared budget, and traversal of a supplied body is capped at 5,000 nodes / 24 levels. If automatic preset application cannot complete safely, sending is blocked with an explanation to disable body presets and use an explicit body. Existing body content is retained.

Regression cases include a tiny schema DAG that previously generated a multi-megabyte body, deep chains, allOf fan-out, YAML-style shared examples, ordinary recursive models and normal manual bodies.
