namespace SampleApi.FastEndpoints.Invoices;

public sealed record Invoice(int Id, int CustomerId, int AssetId, string Description, decimal Total, string Currency)
{
    internal static IReadOnlyList<Invoice> Samples { get; } =
    [
        new(501, 7, 101, "Cooling unit installation", 4700m, "PLN"),
        new(502, 7, 101, "Annual cooling unit service", 380m, "PLN"),
        new(503, 7, 102, "Solar array inspection", 750m, "PLN"),
        new(601, 12, 201, "Loading dock sensor calibration", 240m, "PLN"),
        new(504, 7, 101, "Cooling performance check", 300m, "PLN"),
        new(505, 7, 102, "Solar panel cleaning", 300m, "PLN"),
        new(506, 7, 101, "Replacement filters", 300m, "PLN"),
        new(507, 7, 102, "Electrical inspection", 300m, "PLN"),
        new(602, 12, 201, "Sensor maintenance", 300m, "PLN"),
        new(603, 12, 201, "Firmware update", 300m, "PLN"),
        new(604, 12, 201, "Safety inspection", 300m, "PLN"),
        new(605, 12, 201, "Quarterly service", 300m, "PLN")
    ];
}
