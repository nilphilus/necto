using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;

public sealed class NectoAgentTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    private static JsonObject Catalog() => JsonNode.Parse("""
    {"apis":[{"id":"local","document":{"openapi":"3.1.0","paths":{"/invoices":{"get":{"operationId":"Invoices"}}},"components":{"schemas":{"Invoice":{"type":"object","properties":{"id":{"type":"integer"}}}}}},"operations":[{"key":"GET /invoices","apiId":"local","method":"GET","path":"/invoices","operationId":"Invoices","name":"Invoices"}],"mappings":[{"source":{"apiId":"local","operationId":"Invoices","objectPath":[null],"property":"id"},"target":{"apiId":"local","operationId":"GetInvoice","name":"invoiceId"}}]}]}
    """)!.AsObject();
    private async Task<JsonObject> Connect()
    {
        var response = await client.PostAsJsonAsync("/necto/agent/sessions", new { catalog = Catalog() });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }
    private async Task<HttpResponseMessage> Send(string path, string? token = null, object? body = null, HttpMethod? method = null, string? origin = null)
    {
        using var request = new HttpRequestMessage(method ?? (body is null ? HttpMethod.Get : HttpMethod.Post), "/necto/agent/" + path);
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (origin is not null) request.Headers.Add("Origin", origin);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request);
    }
    private async Task<JsonObject> Rpc(JsonObject session, string method, object? args = null, string? token = null)
    {
        using var response = await Send("mcp", token ?? session["agentToken"]!.ToString(), new { jsonrpc = "2.0", id = 1, method, @params = args });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }
    private async Task<JsonObject> Tool(JsonObject session, string name, object? args = null)
        => (await Rpc(session, "tools/call", new { name, arguments = args ?? new { } }))["result"]!.AsObject();
    private async Task<JsonObject> Queue(JsonObject session, string prompt = "Summarize invoice 42")
    {
        using var response = await Send($"sessions/{session["id"]}/tasks", session["ownerToken"]!.ToString(), new { prompt });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }
    [Fact]
    public async Task InitializeToolsAndApiMetadataWorkOverStatelessMcp()
    {
        var session = await Connect();
        var initialized = await Rpc(session, "initialize", new { protocolVersion = "2025-06-18", capabilities = new { }, clientInfo = new { name = "test", version = "1" } });
        Assert.Equal("2025-06-18", initialized["result"]!["protocolVersion"]!.ToString());
        Assert.Equal(7, (await Rpc(session, "tools/list"))["result"]!["tools"]!.AsArray().Count);
        Assert.Equal("GET /invoices", (await Tool(session, "necto_get_catalog"))["structuredContent"]!["items"]![0]!["key"]!.ToString());
        Assert.Equal("object", (await Tool(session, "necto_get_types", new { apiId = "local", name = "Invoice" }))["structuredContent"]!["schema"]!["type"]!.ToString());
        Assert.NotNull((await Tool(session, "necto_get_operation", new { key = "GET /invoices" }))["structuredContent"]!["components"]!["schemas"]);
        Assert.Equal(1, (await Tool(session, "necto_get_relationships", new { operationId = "Invoices" }))["structuredContent"]!["total"]!.GetValue<int>());
        Assert.Equal(0, (await Tool(session, "necto_get_catalog", new { query = "does-not-exist" }))["structuredContent"]!["total"]!.GetValue<int>());
    }
    [Fact]
    public async Task PromptClaimProgressAndFinishAreVisibleOnlyToTheirOwner()
    {
        var session = await Connect(); var task = await Queue(session);
        var claimed = (await Tool(session, "necto_claim_task", new { agent = "My agent" }))["structuredContent"]!;
        Assert.Equal(task["id"]!.ToString(), claimed["task"]!["id"]!.ToString());
        var args = new { taskId = task["id"]!.ToString(), claimToken = claimed["claimToken"]!.ToString(), message = "Read invoice", request = new { method = "GET", url = "https://localhost/invoices/42", status = 200 } };
        Assert.False((await Tool(session, "necto_report_progress", args))["isError"]!.GetValue<bool>());
        Assert.False((await Tool(session, "necto_finish_task", new { args.taskId, args.claimToken, status = "succeeded", result = "Invoice has 12 lines." }))["isError"]!.GetValue<bool>());
        using var stateResponse = await Send($"sessions/{session["id"]}", session["ownerToken"]!.ToString());
        var state = (await stateResponse.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal("succeeded", state["tasks"]![0]!["status"]!.ToString());
        Assert.Single(state["tasks"]![0]!["events"]!.AsArray());
        Assert.DoesNotContain("claimToken", state.ToJsonString());
        Assert.DoesNotContain(session["agentToken"]!.ToString(), state.ToJsonString());
    }
    [Fact]
    public async Task ConcurrentClaimsAreExclusiveAndClaimTokensAreRequired()
    {
        var session = await Connect(); var task = await Queue(session);
        var claims = await Task.WhenAll(Tool(session, "necto_claim_task", new { agent = "first" }), Tool(session, "necto_claim_task", new { agent = "second" }));
        Assert.Single(claims, x => x["structuredContent"]!["task"] is not null);
        Assert.True((await Tool(session, "necto_finish_task", new { taskId = task["id"]!.ToString(), claimToken = "wrong", status = "succeeded", result = "done" }))["isError"]!.GetValue<bool>());
        using var duplicate = await Send($"sessions/{session["id"]}/tasks", session["ownerToken"]!.ToString(), new { prompt = "Another prompt" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }
    [Fact]
    public async Task CancellationRejectsFurtherProgressAndCompletion()
    {
        var session = await Connect(); var task = await Queue(session);
        var claimed = (await Tool(session, "necto_claim_task", new { agent = "agent" }))["structuredContent"]!;
        var args = new { taskId = task["id"]!.ToString(), claimToken = claimed["claimToken"]!.ToString(), message = "Must stop" };
        using var cancelled = await Send($"sessions/{session["id"]}/tasks/{task["id"]}/cancel", session["ownerToken"]!.ToString(), method: HttpMethod.Post);
        cancelled.EnsureSuccessStatusCode();
        Assert.True((await Tool(session, "necto_report_progress", args))["isError"]!.GetValue<bool>());
        Assert.True((await Tool(session, "necto_finish_task", new { args.taskId, args.claimToken, status = "succeeded", result = "done" }))["isError"]!.GetValue<bool>());
        Assert.Null((await Tool(session, "necto_claim_task", new { agent = "agent" }))["structuredContent"]!["task"]);
    }
    [Fact]
    public async Task BearerRolesIsolationRevocationAndOriginAreEnforced()
    {
        var first = await Connect(); var second = await Connect();
        using var missing = await Send("mcp", body: new { jsonrpc = "2.0", id = 1, method = "ping" });
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        using var wrong = await Send($"sessions/{first["id"]}", second["ownerToken"]!.ToString());
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        using var agentAsOwner = await Send($"sessions/{first["id"]}", first["agentToken"]!.ToString());
        Assert.Equal(HttpStatusCode.Unauthorized, agentAsOwner.StatusCode);
        using var ownerAsAgent = await Send("mcp", first["ownerToken"]!.ToString(), new { jsonrpc = "2.0", id = 1, method = "ping" });
        Assert.Equal(HttpStatusCode.Unauthorized, ownerAsAgent.StatusCode);
        using var hostile = await Send("sessions", body: new { catalog = Catalog() }, origin: "https://other.test");
        Assert.Equal(HttpStatusCode.Forbidden, hostile.StatusCode);
        using var revoked = await Send($"sessions/{first["id"]}", first["ownerToken"]!.ToString(), method: HttpMethod.Delete);
        revoked.EnsureSuccessStatusCode();
        using var after = await Send("mcp", first["agentToken"]!.ToString(), new { jsonrpc = "2.0", id = 1, method = "ping" });
        Assert.Equal(HttpStatusCode.Unauthorized, after.StatusCode);
        Assert.NotNull((await Rpc(second, "ping"))["result"]);
    }
    [Fact]
    public async Task InvalidArgumentsAndMalformedProtocolDoNotExecuteWork()
    {
        var session = await Connect();
        Assert.True((await Tool(session, "necto_get_catalog", new { page = -1 }))["isError"]!.GetValue<bool>());
        Assert.True((await Tool(session, "necto_get_types", new { apiId = "missing" }))["isError"]!.GetValue<bool>());
        Assert.True((await Tool(session, "necto_claim_task", new { agent = "" }))["isError"]!.GetValue<bool>());
        using var invalid = await Send("sessions", body: new { catalog = new { apis = new[] { new { id = "local" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var tooLong = await Send($"sessions/{session["id"]}/tasks", session["ownerToken"]!.ToString(), new { prompt = new string('x', 8001) });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        using var notification = await Send("mcp", session["agentToken"]!.ToString(), new { jsonrpc = "2.0", method = "notifications/initialized" });
        Assert.Equal(HttpStatusCode.Accepted, notification.StatusCode);
        using var get = await Send("mcp", session["agentToken"]!.ToString());
        Assert.Equal(HttpStatusCode.MethodNotAllowed, get.StatusCode);
        Assert.Equal(-32601, (await Rpc(session, "not/a/method"))["error"]!["code"]!.GetValue<int>());
    }
    [Fact]
    public async Task CatalogPagingAndExternalApiIdentitiesRemainIndependent()
    {
        var catalog = Catalog();
        var local = catalog["apis"]![0]!.AsObject();
        var external = local.DeepClone().AsObject();
        external["id"] = "billing";
        external["operations"]![0]!["key"] = "billing-key";
        external["operations"]![0]!["apiId"] = "billing";
        external["document"]!["components"]!["schemas"]!["Invoice"]!["type"] = "string";
        external["mappings"] = new JsonArray();
        catalog["apis"]!.AsArray().Add(external);
        for (var i = 0; i < 30; i++)
            local["operations"]!.AsArray().Add(new JsonObject { ["key"] = $"GET /extra/{i}", ["apiId"] = "local", ["method"] = "GET", ["path"] = $"/extra/{i}" });
        using var response = await Send("sessions", body: new { catalog });
        response.EnsureSuccessStatusCode();
        var session = (await response.Content.ReadFromJsonAsync<JsonObject>())!;
        var second = (await Tool(session, "necto_get_catalog", new { page = 2 }))["structuredContent"]!;
        Assert.Equal(32, second["total"]!.GetValue<int>());
        Assert.Equal(7, second["items"]!.AsArray().Count);
        Assert.Equal("billing", (await Tool(session, "necto_get_operation", new { key = "billing-key" }))["structuredContent"]!["operation"]!["apiId"]!.ToString());
        Assert.Equal("string", (await Tool(session, "necto_get_types", new { apiId = "billing", name = "Invoice" }))["structuredContent"]!["schema"]!["type"]!.ToString());
        Assert.Equal("object", (await Tool(session, "necto_get_types", new { apiId = "local", name = "Invoice" }))["structuredContent"]!["schema"]!["type"]!.ToString());
    }
    [Fact]
    public async Task ProtocolParseErrorsAndBodyLimitsAreExplicit()
    {
        var session = await Connect();
        using var malformed = new HttpRequestMessage(HttpMethod.Post, "/necto/agent/mcp");
        malformed.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session["agentToken"]!.ToString());
        malformed.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        malformed.Content = new StringContent("{broken", System.Text.Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(malformed);
        var json = (await response.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal(-32700, json["error"]!["code"]!.GetValue<int>());
        using var oversized = await Send("sessions", body: new { extra = new string('x', 2 * 1024 * 1024), catalog = Catalog() });
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversized.StatusCode);
    }
    [Fact]
    public void ExpiredClaimsFailWithoutRequeueAndSessionCapacityIsBounded()
    {
        var store = new NectoAgentStore(); var session = store.Create(Catalog());
        var task = new AgentTask("Do work") { Status = "running", ClaimToken = "claim", LeaseUntil = DateTimeOffset.UtcNow.AddSeconds(-1) };
        session.Tasks.Add(task); session.ExpireClaims();
        Assert.Equal("failed", task.Status); Assert.Null(task.ClaimToken); Assert.Contains("may already have run", task.Result);
        for (var i = 1; i < 32; i++) store.Create(Catalog());
        Assert.Throws<AgentError>(() => store.Create(Catalog()));
        store.Remove(session.Id); Assert.Null(store.Agent(session.AgentToken));
        store.Create(Catalog());
    }
}
