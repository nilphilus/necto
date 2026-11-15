namespace Necto;

/// <summary>Compile-time JSON-visible model or identifier; IDs preserve CLR qualification.</summary>
public sealed record EntityCatalogEntry(string Id, string Name, string Kind, EntityCatalogUse[] Uses);
/// <summary>Null path segments denote array items. Contains metadata only, never response data.</summary>
public sealed record EntityCatalogUse(string OperationId, string Direction, string Location, string?[] Path);
