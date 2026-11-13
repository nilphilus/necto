using SampleApi.FastEndpoints.Buildings;

namespace SampleApi.FastEndpoints.Invoices;

internal sealed class InvoiceStore(Invoice[] seed)
{
    private readonly Lock gate = new();
    private readonly Dictionary<int, Invoice> invoices = seed.ToDictionary(invoice => invoice.Id);
    private int nextInvoiceId = 1000;

    public InvoiceSummary[] List(int? buildingId, int? customerId)
    {
        lock (gate)
        {
            return invoices.Values
                .Where(invoice => (buildingId is null || invoice.BuildingId == buildingId)
                    && (customerId is null || invoice.CustomerId == customerId))
                .OrderBy(invoice => invoice.IssuedOn is null)
                .ThenByDescending(invoice => invoice.IssuedOn)
                .ThenBy(invoice => invoice.Id)
                .Select(invoice => new InvoiceSummary(invoice.Id, invoice.BuildingId, invoice.CustomerId,
                    invoice.Customer.Name, invoice.BuildingName, invoice.Currency, invoice.IssuedOn, invoice.Total))
                .ToArray();
        }
    }

    public Invoice? Find(int id)
    {
        lock (gate)
            return invoices.GetValueOrDefault(id);
    }

    public Invoice Create(Building building, string currency, InvoiceLine[] lines)
    {
        _ = lines.Sum(line => line.Amount);
        lock (gate)
        {
            var invoice = new Invoice(nextInvoiceId++, building.Id, building.Owner,
                building.Name, currency, null, lines);
            invoices.Add(invoice.Id, invoice);
            return invoice;
        }
    }

    public (AddLineResult Status, Invoice? Invoice) AddLine(int invoiceId, InvoiceLine line)
    {
        lock (gate)
        {
            var invoice = invoices[invoiceId];
            if (invoice.IssuedOn is not null)
                return (AddLineResult.Issued, null);
            if (invoice.Lines.Any(existing => existing.AssetId == line.AssetId))
                return (AddLineResult.Duplicate, null);

            _ = invoice.Total + line.Amount;
            var updated = invoice with { Lines = [.. invoice.Lines, line] };
            invoices[invoiceId] = updated;
            return (AddLineResult.Added, updated);
        }
    }
}

internal enum AddLineResult { Added, Issued, Duplicate }
