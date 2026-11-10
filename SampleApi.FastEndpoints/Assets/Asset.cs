namespace SampleApi.FastEndpoints.Assets;

public sealed record Asset(int Id, int CustomerId, int LocationId, string Name)
{
    internal static IReadOnlyList<Asset> Samples { get; } =
    [
        new(101, 7, 1, "Warehouse cooling unit"),
        new(102, 7, 2, "Roof solar array"),
        new(201, 12, 1, "Loading dock sensor")
    ];
}
