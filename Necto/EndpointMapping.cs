namespace Necto;

/// <summary>Associates request parameters and DTO properties with the same logical identifier.</summary>
[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Property)]
public sealed class EndpointValueAttribute(string key) : Attribute
{
    public string Key { get; } = key;
}

public sealed record EndpointMapping(
    ResponseValue Source,
    RequestValue Target,
    string Match,
    string? SuggestedIdentifierType)
{
    /// <summary>Compile-time evidence, not a guarantee of business validity.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public MappingEvidence? Evidence { get; init; }
}

public sealed record MappingEvidence(string SourceType, string TargetType, string? SourceName, string? TargetName, string? LogicalKey);

/// <param name="OperationId">The OpenAPI operation ID.</param>
/// <param name="EachItem">Whether the response is an array and the selector applies to each item.</param>
/// <param name="Property">The JSON property name, or null for the entire response or array item.</param>
public sealed record ResponseValue(string OperationId, bool EachItem, string? Property)
{
    /// <summary>Optional API connection ID. Omitted means the API serving this mapping; local identifies the host UI API.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? ApiId { get; init; }

    /// <summary>Path to the containing object. Null segments select array items.
    /// When omitted, EachItem selects the legacy root object or root array items.</summary>
    public string?[]? ObjectPath { get; init; }
}

/// <param name="OperationId">The OpenAPI operation ID.</param>
/// <param name="Location">Path, query, header, body, or parameter when OpenAPI determines the location.</param>
/// <param name="Name">The wire name, or null for the entire JSON request body.</param>
public sealed record RequestValue(string OperationId, string Location, string? Name)
{
    /// <summary>Optional API connection ID. Omitted means the API serving this mapping; local identifies the host UI API.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? ApiId { get; init; }
    /// <summary>Path to the containing JSON object. Null segments select existing array items.</summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string?[]? ObjectPath { get; init; }

}
