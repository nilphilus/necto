using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed record InvoiceLineSummary(int LineId, int InvoiceId, string Description);
public sealed record InvoiceLineItem(int LineId, string Description, int Quantity, int DetailId);
public sealed record InvoiceLinePricing(int LineId, int Quantity, decimal UnitPrice, string Currency)
{
    public decimal NetAmount => Quantity * UnitPrice;
}

internal sealed record InvoiceLineSample(int LineId, int InvoiceId, string Description, int Quantity, int DetailId, decimal UnitPrice)
{
    internal static IReadOnlyList<InvoiceLineSample> All { get; } = new InvoiceLineSample[]
    {
        new(17, 501, "Cooling unit", 1, 117, 3600m),
        new(18, 501, "Installation", 2, 118, 300m),
        new(19, 502, "Annual service", 1, 119, 380m),
        new(20, 503, "Array inspection", 3, 120, 250m),
        new(21, 601, "Sensor calibration", 2, 121, 120m)
    }.Concat(Enumerable.Range(22, 10)
        .Select(id => new InvoiceLineSample(id, 501, $"Service item {id}", 1, id + 100, 50m)))
        .Concat(Invoice.Samples.Where(invoice => invoice.Id is >= 504 and <= 507 or >= 602)
            .SelectMany(invoice => Enumerable.Range(1, 6)
                .Select(index => new InvoiceLineSample(invoice.Id * 100 + index, invoice.Id,
                    $"Invoice {invoice.Id} service {index}", 1, invoice.Id * 1000 + index, 50m))))
        .ToArray();
}

public sealed class InvoiceLines : Endpoint<GetInvoiceRequest, InvoiceLineSummary[]>
{
    public override void Configure()
    {
        Get("/{invoiceId:int}/lines");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Invoice lines");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetInvoiceRequest request, CancellationToken ct)
    {
        var invoiceLines = Resolve<InvoiceStore>().ListLines(request.InvoiceId);
        if (invoiceLines is null)
            return Send.NotFoundAsync(ct);

        var lines = invoiceLines
            .Select(line => new InvoiceLineSummary(line.LineId, line.InvoiceId, line.Description))
            .ToArray();
        return Send.OkAsync(lines, ct);
    }
}

public sealed class InvoiceLineRequest
{
    [RouteParam]
    public int LineId { get; init; }
}

public sealed class InvoiceLine : Endpoint<InvoiceLineRequest, InvoiceLineItem>
{
    public override void Configure()
    {
        Get("/lines/{lineId:int}");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Invoice line");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(InvoiceLineRequest request, CancellationToken ct)
    {
        var line = Resolve<InvoiceStore>().FindLine(request.LineId);
        return line is null
            ? Send.NotFoundAsync(ct)
            : Send.OkAsync(new InvoiceLineItem(line.LineId, line.Description, line.Quantity, line.DetailId), ct);
    }
}

public sealed class InvoiceLineDetailsRequest
{
    [RouteParam]
    public int DetailId { get; init; }
}

public sealed class InvoiceLineDetails : Endpoint<InvoiceLineDetailsRequest, InvoiceLinePricing>
{
    public override void Configure()
    {
        Get("/line-details/{detailId:int}");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Invoice line details");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(InvoiceLineDetailsRequest request, CancellationToken ct)
    {
        var pricing = Resolve<InvoiceStore>().FindPricing(request.DetailId);
        return pricing is null ? Send.NotFoundAsync(ct) : Send.OkAsync(pricing, ct);
    }
}
