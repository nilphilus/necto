namespace SampleApi.FastEndpoints.Invoices;

using Necto;
using SampleApi.FastEndpoints.Customers;

public sealed record InvoiceSummary([property: EndpointValue("InvoiceId")] int Id, int BuildingId, int CustomerId, string CustomerName,
    string BuildingName, string Currency, DateOnly? IssuedOn, decimal Total);

public sealed record Invoice(int Id, int BuildingId, Customer Customer, string BuildingName,
    string Currency, DateOnly? IssuedOn, IReadOnlyList<InvoiceLine> Lines)
{
    public int CustomerId => Customer.Id;
    public decimal Total => Lines.Sum(line => line.Amount);
}

public sealed record InvoiceLine(int AssetId, string AssetName, string Description, int Quantity, decimal UnitPrice)
{
    public decimal Amount => Quantity * UnitPrice;
}
