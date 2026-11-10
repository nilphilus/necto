namespace SampleApi.FastEndpoints.Invoices;

public sealed record Invoice(int Id, int CustomerId, int AssetId, string Description, decimal Total, string Currency)
{
    internal static IReadOnlyList<Invoice> Samples { get; } =
    [
        new(501, 7, 101, "Cooling unit installation", 4200m, "PLN"),
        new(502, 7, 101, "Annual cooling unit service", 380m, "PLN"),
        new(503, 7, 102, "Solar array inspection", 750m, "PLN"),
        new(601, 12, 201, "Loading dock sensor calibration", 240m, "PLN")
    ];
}
