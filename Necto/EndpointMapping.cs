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
    string? SuggestedIdentifierType);

/// <param name="OperationId">The OpenAPI operation ID.</param>
/// <param name="EachItem">Whether the response is an array and the selector applies to each item.</param>
/// <param name="Property">The JSON property name, or null for the entire response or array item.</param>
public sealed record ResponseValue(string OperationId, bool EachItem, string? Property);

/// <param name="OperationId">The OpenAPI operation ID.</param>
/// <param name="Location">Path, query, header, body, or parameter when OpenAPI determines the location.</param>
/// <param name="Name">The wire name, or null for the entire JSON request body.</param>
public sealed record RequestValue(string OperationId, string Location, string? Name);
