# Bring your agent

Write a prompt in Necto and let your own agent work with the API. Necto exposes
the visible endpoints, types and value-flow mappings through MCP, queues the
prompt, and displays progress and results reported by the agent. No model API
key or model subscription is configured in Necto.

## Enable in ASP.NET Core

The feature is opt-in. Register both the bridge and its UI configuration:

```csharp
app.MapNectoAgent("/necto/agent");
app.UseNectoUI(
    endpointMappingsPath: "/necto/endpoint-mappings",
    agentPath: "/necto/agent");
```

SampleApi enables this in Development. **Bring your agent** appears in the
workspace navigation and supports the `/necto/agent` UI deep link. The bridge's
HTTP routes are nested below it; MCP is at `/necto/agent/mcp`. Both paths respect
ASP.NET Core PathBase. When mounting the UI elsewhere, pass the bridge path to
`agentPath` explicitly.

The bridge returns a `RouteGroupBuilder` so a host can apply its authorization:

```csharp
app.MapNectoAgent().RequireAuthorization("NectoUsers");
```

Protect the UI and bridge with the host's authentication before exposing them
beyond local development. The bootstrap `/sessions` endpoint creates new
capabilities, so protect the whole group, including bootstrap. Agent requests
must also satisfy any host policy. Forwarded scheme/host information must be
configured correctly before these endpoints when using a reverse proxy.

## Use your agent

1. Open **Bring your agent** and select **Create agent connection**. This shares
   a snapshot of the currently visible local and external OpenAPI documents,
   types, scoped operations and mappings. Drafts, presets, response history,
   saved scenarios and their credentials are excluded. OpenAPI documents
   themselves can contain examples or server configuration: review those before
   sharing them.
2. Expand **Connect your agent**, reveal the connection config and add it to an
   MCP client supporting **Streamable HTTP** and custom authorization headers.
   The displayed JSON uses `mcpServers`; adapt its outer structure to your client.
   Keep the bearer token private. The MCP URL must be reachable from the agent's
   machine; a remote agent cannot reach your machine's `localhost`.
3. Give the agent the displayed **Agent instructions**. MCP supplies tools; it
   cannot start an arbitrary agent or force a client to poll automatically.
   The client needs an active agent turn that calls the task tools, and its own
   HTTP tool and API credentials to execute requests.
4. Enter a prompt, for example: **“Find invoice 42, read its line items and
   summarize their descriptions.”** Select **Queue prompt**. The agent claims
   the task, discovers the relevant operations and mappings, executes through
   its own HTTP tools, and reports progress and a final result.
5. Use **Cancel task** to invalidate the claim, or **Disconnect agent** to revoke
   both capabilities. These do not undo API changes or abort an HTTP request
   already running in the external agent.

A single task can be queued or running per connection. API catalog changes
invalidate the connection; reconnect to share fresh metadata. Switching workspace
views preserves it. Tokens are held only in browser memory. Leaving/reloading the
page attempts to revoke the connection; network failure can prevent cleanup, so
server capabilities also expire two hours after creation. A server restart loses
all connections and tasks. No conversations or API responses are persisted.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `necto_get_catalog` | Page scoped endpoint summaries, with optional literal search. |
| `necto_get_operation` | Read a scoped operation key, resolved API base URL, parameters, request/response metadata, original operation definition, shared components and security requirements. |
| `necto_get_types` | Page named schemas for an API ID, or read a schema by name. References remain JSON references. Inline types are in operation metadata. |
| `necto_get_relationships` | Page response-to-request mappings, including nested selectors and cross-API IDs; optionally filter by operation ID. |
| `necto_claim_task` | Atomically claim a pending prompt using an agent name. Returns `task: null` when no work is available. |
| `necto_report_progress` | Validate and renew a claim; report a message and optional HTTP method/URL/status summary. |
| `necto_finish_task` | Finish a valid claim with `succeeded` or `failed` and a plain-text result. |

Metadata tools page results in groups of 25. API IDs scope operations and schemas;
identical operation IDs across external services do not identify the same
operation. Request URLs follow Necto's operation/server-variable/override rules.
A missing server variable produces an explicit `urlError`, not a guessed URL.
Browser presets are never applied to agent HTTP requests. The agent is responsible
for OpenAPI parameter serialization and its own authentication.

## Task ownership and execution

Claiming returns a separate, private `claimToken`, required for progress and
completion. Another agent cannot claim the same task. The lease lasts 120 seconds;
progress renews it. Call `necto_report_progress` before each API action and at
least every 60 seconds during longer work; stop when a claim is rejected. A
cancelled or expired task rejects further progress/completion. Expiry marks work
failed and never automatically requeues it: a timed-out agent may already have
changed the API. The host agent's normal approval policy controls API mutations.

The bridge supplies context and task coordination; it is not an HTTP proxy or an
LLM runner. API descriptions and response content are untrusted data, not agent
instructions. The displayed progress, HTTP summaries and final results are
agent-reported; Necto does not independently verify their execution.

## Transport and limits

The endpoint implements a stateless JSON-RPC MCP tools transport over Streamable
HTTP POST, with JSON responses. It supports initialization, initialized
notifications, ping, tools/list and tools/call. It negotiates protocol versions
`2025-11-25`, `2025-06-18` and `2025-03-26`. GET streaming and DELETE transport
sessions return 405; there are no server notifications, SSE streams, sampling,
OAuth discovery or stdio transport. Owner revocation is a separate authenticated
DELETE `/sessions/{id}`. Connect with the bearer header, never a URL query token.

State is bounded to 32 connections per mapped bridge, 20 tasks per connection,
100 latest progress events per task, 8,000 prompt characters and 16,000 result
characters. Request bodies, including a catalog snapshot, are limited to 2 MiB.
All state is process-local; multi-instance hosts need sticky routing or a future
shared store. Origin validation rejects browser requests from other origins;
CORS access is not enabled by this feature. UI ownership and agent access use
separate tokens, and every task mutation requires its corresponding capability.
