using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Necto;

public static class NectoAgentExtensions
{
    /// <summary>Maps an opt-in, in-memory task bridge and stateless Streamable HTTP MCP endpoint.
    /// Apply application authorization to the returned group when exposing it beyond local development.</summary>
    public static RouteGroupBuilder MapNectoAgent(this WebApplication app, string path = "/necto/agent")
    {
        ArgumentNullException.ThrowIfNull(app);
        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith('/') || path.StartsWith("//") || path.Contains('\\') || path.Contains('?') || path.Contains('#') || path.TrimEnd('/').Length == 0)
            throw new ArgumentException("Use a non-root application-relative path.", nameof(path));
        var store = new NectoAgentStore();
        var group = app.MapGroup(path.TrimEnd('/')).ExcludeFromDescription();
        group.AddEndpointFilter(async (invocation, next) =>
        {
            var context = invocation.HttpContext;
            context.Response.Headers.CacheControl = "no-store";
            // Streamable HTTP Origin validation also protects browser session creation from CSRF.
            if (context.Request.Headers.TryGetValue("Origin", out var origin) &&
                (!Uri.TryCreate(origin.ToString(), UriKind.Absolute, out var uri) ||
                 uri.GetLeftPart(UriPartial.Authority) != $"{context.Request.Scheme}://{context.Request.Host}"))
                return Results.StatusCode(403);
            try { return await next(invocation); }
            catch (AgentError error) { return Results.Json(new { error = error.Message }, statusCode: error.Status); }
            catch (JsonException) { return Results.BadRequest(new { error = "Expected a valid JSON object." }); }
        });
        group.MapPost("/sessions", async (HttpContext context) =>
        {
            var body = await Read(context);
            var catalog = body["catalog"] as JsonObject ?? throw new AgentError("An API catalog is required.");
            ValidateCatalog(catalog);
            var session = store.Create(catalog);
            return Results.Json(new { session.Id, session.OwnerToken, session.AgentToken, session.ExpiresAt });
        });
        group.MapGet("/sessions/{id}", (HttpContext context, string id) =>
        {
            lock (store.Gate) return Results.Json(Owner(context, id).Snapshot());
        });
        group.MapDelete("/sessions/{id}", (HttpContext context, string id) =>
        {
            lock (store.Gate) { Owner(context, id); store.Remove(id); return Results.NoContent(); }
        });
        group.MapPost("/sessions/{id}/tasks", async (HttpContext context, string id) =>
        {
            var body = await Read(context);
            var prompt = Text(body, "prompt", 8000);
            lock (store.Gate)
            {
                var session = Owner(context, id);
                session.ExpireClaims();
                if (session.Tasks.Any(x => x.Status is "queued" or "running")) throw new AgentError("Finish or cancel the current task first.", 409);
                if (session.Tasks.Count >= 20) throw new AgentError("This connection has reached 20 tasks. Start a new connection.", 409);
                var task = new AgentTask(prompt);
                session.Tasks.Add(task);
                return Results.Json(task.Snapshot(), statusCode: 201);
            }
        });
        group.MapPost("/sessions/{id}/tasks/{taskId}/cancel", (HttpContext context, string id, string taskId) =>
        {
            lock (store.Gate)
            {
                var task = Owner(context, id).Tasks.FirstOrDefault(x => x.Id == taskId) ?? throw new AgentError("Task not found.", 404);
                if (task.Status is "queued" or "running") { task.Status = "cancelled"; task.ClaimToken = null; task.Result = "Cancelled by the user. This cannot undo API requests already sent."; }
                return Results.Json(task.Snapshot());
            }
        });
        group.MapPost("/mcp", async (HttpContext context) =>
        {
            if (store.Agent(Bearer(context)) is null) throw new AgentError("A valid agent bearer token is required.", 401);
            if (context.Request.Headers.TryGetValue("MCP-Protocol-Version", out var protocol) && !NectoAgentProtocol.Versions.Contains(protocol.ToString()))
                return Results.BadRequest(new { error = "Unsupported MCP protocol version." });
            if (!context.Request.GetTypedHeaders().Accept?.Any(x => x.MediaType.Value == "application/json") ?? true)
                return Results.StatusCode(406);
            JsonObject request;
            try { request = await Read(context); }
            catch (JsonException) { return Results.Json(new { jsonrpc = "2.0", id = (string?)null, error = new { code = -32700, message = "Parse error." } }); }
            lock (store.Gate)
            {
                var session = store.Agent(Bearer(context)) ?? throw new AgentError("A valid agent bearer token is required.", 401);
                return NectoAgentProtocol.Handle(session, request);
            }
        });
        // No server-initiated stream or transport session is needed for this polling bridge.
        group.MapGet("/mcp", () => Results.StatusCode(405));
        group.MapDelete("/mcp", () => Results.StatusCode(405));
        return group;

        AgentSession Owner(HttpContext context, string id) => store.Owner(id, Bearer(context)) ?? throw new AgentError("Connection expired or unauthorized. Reconnect from Necto.", 401);
    }

    private static string Bearer(HttpContext context)
    {
        var value = context.Request.Headers.Authorization.ToString();
        return value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? value[7..] : "";
    }
    private static async Task<JsonObject> Read(HttpContext context)
    {
        if (!context.Request.HasJsonContentType()) throw new AgentError("Use Content-Type: application/json.", 415);
        const int maxBytes = 2 * 1024 * 1024;
        if (context.Request.ContentLength > maxBytes) throw new AgentError("Request exceeds the 2 MiB limit.", 413);
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int read;
        while ((read = await context.Request.Body.ReadAsync(chunk, context.RequestAborted)) > 0)
        {
            if (buffer.Length + read > maxBytes) throw new AgentError("Request exceeds the 2 MiB limit.", 413);
            buffer.Write(chunk, 0, read);
        }
        return JsonNode.Parse(buffer.ToArray()) as JsonObject ?? throw new JsonException();
    }
    internal static string Text(JsonObject node, string name, int max)
    {
        if (node[name] is not JsonValue value || !value.TryGetValue<string>(out var text) || string.IsNullOrWhiteSpace(text) || text.Length > max)
            throw new AgentError($"{name} must contain 1–{max} characters.");
        return text.Trim();
    }
    private static void ValidateCatalog(JsonObject catalog)
    {
        if (catalog["apis"] is not JsonArray { Count: > 0 and <= 32 } apis) throw new AgentError("Supply 1–32 API documents.");
        var ids = new HashSet<string>();
        foreach (var entry in apis)
        {
            if (entry is not JsonObject api || !ids.Add(Text(api, "id", 100)) || api["document"] is not JsonObject document ||
                document["openapi"] is not JsonValue || document["paths"] is not JsonObject ||
                api["operations"] is not JsonArray || api["mappings"] is not JsonArray)
                throw new AgentError("Each API needs a unique ID, OpenAPI document, operations and mappings.");
        }
    }
}
