using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace Necto;

// A bounded, process-local capability store. No prompts, credentials or results are persisted.
internal sealed class NectoAgentStore
{
    private readonly Dictionary<string, AgentSession> sessions = [];
    internal readonly object Gate = new();
    internal static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    internal AgentSession Create(JsonObject catalog)
    {
        lock (Gate)
        {
            foreach (var key in sessions.Where(x => x.Value.ExpiresAt <= DateTimeOffset.UtcNow).Select(x => x.Key).ToArray()) sessions.Remove(key);
            if (sessions.Count >= 32) throw new AgentError("Too many active connections. Disconnect an existing connection or wait for expiry.", 429);
            var session = new AgentSession(catalog);
            sessions.Add(session.Id, session);
            return session;
        }
    }
    internal AgentSession? Owner(string id, string token)
    {
        lock (Gate) return sessions.TryGetValue(id, out var session) && session.ExpiresAt > DateTimeOffset.UtcNow && session.OwnerToken == token ? session : null;
    }
    internal AgentSession? Agent(string token)
    {
        lock (Gate) return sessions.Values.FirstOrDefault(x => x.ExpiresAt > DateTimeOffset.UtcNow && x.AgentToken == token);
    }
    internal void Remove(string id) { lock (Gate) sessions.Remove(id); }
}

internal sealed class AgentSession(JsonObject catalog)
{
    internal string Id { get; } = Guid.NewGuid().ToString("N");
    internal string OwnerToken { get; } = NectoAgentStore.Token();
    internal string AgentToken { get; } = NectoAgentStore.Token();
    internal DateTimeOffset ExpiresAt { get; } = DateTimeOffset.UtcNow.AddHours(2);
    internal DateTimeOffset? LastSeen { get; set; }
    internal JsonObject Catalog { get; } = catalog;
    internal List<AgentTask> Tasks { get; } = [];
    internal void ExpireClaims()
    {
        foreach (var task in Tasks.Where(x => x.Status == "running" && x.LeaseUntil <= DateTimeOffset.UtcNow))
        {
            task.Status = "failed";
            task.Result = "Agent lease expired. Requests may already have run. Inspect the API before submitting another task.";
            task.ClaimToken = null;
        }
    }
    internal object Snapshot()
    {
        ExpireClaims();
        return new { id = Id, expiresAt = ExpiresAt, lastSeen = LastSeen, tasks = Tasks.Select(x => x.Snapshot()).ToArray() };
    }
}

internal sealed class AgentTask(string prompt)
{
    internal string Id { get; } = Guid.NewGuid().ToString("N");
    internal string Prompt { get; } = prompt;
    internal DateTimeOffset CreatedAt { get; } = DateTimeOffset.UtcNow;
    internal string Status { get; set; } = "queued";
    internal string? Agent { get; set; }
    internal string? ClaimToken { get; set; }
    internal DateTimeOffset? LeaseUntil { get; set; }
    internal string? Result { get; set; }
    internal List<object> Events { get; } = [];
    internal object Snapshot() => new { id = Id, prompt = Prompt, createdAt = CreatedAt, status = Status, agent = Agent, leaseUntil = LeaseUntil, result = Result, events = Events.ToArray() };
}
internal sealed class AgentError(string message, int status = 400) : Exception(message)
{
    internal int Status { get; } = status;
}
