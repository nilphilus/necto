namespace SampleApi.FastEndpoints.Assets;

public sealed record Asset(int Id, int BuildingId, string Name, string Kind, string? MeterId);
