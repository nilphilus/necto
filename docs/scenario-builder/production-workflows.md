# Scenario Builder in a real product: what next?

The most useful additions make asynchronous workflows predictable and help clean up the data they create. They should stay in step details or run review rather than adding permanent panels around responses.

| Priority | Addition | Concrete use | Suggested UX |
| --- | --- | --- | --- |
| P1 | **A scenario deadline** | Stop a checkout/report workflow after two minutes, including human pauses, delays, queueing and retries. Per-request timeouts alone cannot bound the entire run. | One optional run-level timeout and elapsed/remaining time in the execution bar. |
| P1 | **Failure and cleanup paths** | Delete a temporary customer or uploaded file even if a later request fails. A cleanup request is not a transactional rollback. | An explicit “Always run / on failure” connection, with a distinct line style and failure trace. |
| P2 | **Run datasets and Faker seeds** | Reproduce a failed run with the same generated fixtures, or run one scenario against several datasets. | Named variables are available now; add optional seeds/datasets in run review. |
| P2 | **Explicit transient-error retries** | A job lookup returns 404 before it exists, or a service returns 429/503. Equality polling currently stops on these errors. | Per-step status allowlist, capped exponential backoff and `Retry-After`; no implicit retries for writes. Surface idempotency keys where the API supports them. |
| P2 | **Conditional paths** | Create a customer only when a lookup does not find one, or route an approved/rejected payment differently. | Typed conditions (`exists`, `equals`, numeric comparisons) and labeled outcome connections; no user JavaScript. |
| P2 | **Bounded “for each”** | Process each invoice line or verify every resource returned by a collection. | Array binding, maximum item count and concurrency limit, with a collapsed group of results. |
| P2 | **Headless execution of Builder definitions** | Reproduce a workflow in CI and publish JUnit/results without keeping a browser open. | Extend the existing runner with the v5 DAG format; fail clearly on human steps unless values are supplied. Keep this complementary to application e2e tests. |

**Recommended order:** deadline → cleanup paths → reproducible datasets. They cover hung workflows, test-data accumulation and reproducibility before adding more graph complexity.

Implemented features include **Delay**, **Wait for response value**, typed comparison, retry count/interval, cancellation, attempt history, graphical connections and shared run variables (static, generated, human and response-derived). The table is a proposal, not a list of shipped features.
