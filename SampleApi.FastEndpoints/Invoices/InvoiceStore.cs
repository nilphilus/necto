namespace SampleApi.FastEndpoints.Invoices;

internal sealed class InvoiceStore
{
    private readonly Lock gate = new();
    private readonly Dictionary<int, Invoice> invoices = Invoice.Samples.ToDictionary(invoice => invoice.Id);
    private readonly Dictionary<int, InvoiceLineSample> lines = InvoiceLineSample.All.ToDictionary(line => line.LineId);
    private int nextInvoiceId = Invoice.Samples.Max(invoice => invoice.Id) + 1;
    private int nextLineId = InvoiceLineSample.All.Max(line => line.LineId) + 1;
    private int nextDetailId = InvoiceLineSample.All.Max(line => line.DetailId) + 1;

    public Invoice[] List()
    {
        lock (gate)
            return invoices.Values.ToArray();
    }

    public Invoice? Find(int id)
    {
        lock (gate)
            return invoices.GetValueOrDefault(id);
    }

    public InvoiceLineSample[]? ListLines(int invoiceId)
    {
        lock (gate)
            return invoices.ContainsKey(invoiceId) ? lines.Values.Where(line => line.InvoiceId == invoiceId).ToArray() : null;
    }

    public InvoiceLineSample? FindLine(int lineId)
    {
        lock (gate)
            return lines.GetValueOrDefault(lineId);
    }

    public InvoiceLinePricing? FindPricing(int detailId)
    {
        lock (gate)
        {
            var line = lines.Values.FirstOrDefault(line => line.DetailId == detailId);
            return line is null ? null : new(line.LineId, line.Quantity, line.UnitPrice, invoices[line.InvoiceId].Currency);
        }
    }

    public Invoice Create(CreateInvoiceRequest request)
    {
        var total = request.Lines.Sum(line => line.Quantity * line.UnitPrice);
        lock (gate)
        {
            var invoice = new Invoice(nextInvoiceId++, request.CustomerId, request.AssetId,
                request.Description, total, request.Currency);
            invoices.Add(invoice.Id, invoice);
            foreach (var line in request.Lines)
                InsertLine(invoice.Id, line);
            return invoice;
        }
    }

    public InvoiceLineItem? AddLine(int invoiceId, InvoiceLineInput input)
    {
        lock (gate)
        {
            if (!invoices.TryGetValue(invoiceId, out var invoice))
                return null;

            var total = invoice.Total + input.Quantity * input.UnitPrice;
            var line = InsertLine(invoiceId, input);
            invoices[invoiceId] = invoice with { Total = total };
            return new(line.LineId, line.Description, line.Quantity, line.DetailId);
        }
    }

    private InvoiceLineSample InsertLine(int invoiceId, InvoiceLineInput input)
    {
        var line = new InvoiceLineSample(nextLineId++, invoiceId, input.Description,
            input.Quantity, nextDetailId++, input.UnitPrice);
        lines.Add(line.LineId, line);
        return line;
    }
}
