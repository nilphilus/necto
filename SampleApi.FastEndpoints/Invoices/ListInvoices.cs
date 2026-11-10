using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class ListInvoicesRequest
{
    [QueryParam]
    public int? CustomerId { get; init; }

    [QueryParam]
    public int? AssetId { get; init; }
}

public sealed class ListInvoices : Endpoint<ListInvoicesRequest, Invoice[]>
{
    public override void Configure()
    {
        Get("/");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List invoices by customer, asset, or both");
    }

    public override Task HandleAsync(ListInvoicesRequest request, CancellationToken ct)
    {
        var invoices = Invoice.Samples
            .Where(invoice => (request.CustomerId is null || invoice.CustomerId == request.CustomerId)
                && (request.AssetId is null || invoice.AssetId == request.AssetId))
            .ToArray();

        return Send.OkAsync(invoices, ct);
    }
}
