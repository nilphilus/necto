using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class ListInvoicesRequest : TenantRequest
{
    [QueryParam]
    public int? CustomerId { get; init; }

    [QueryParam]
    public int? BuildingId { get; init; }
}

public sealed class ListInvoices : TenantEndpoint<ListInvoicesRequest, InvoiceSummary[]>
{
    public override void Configure()
    {
        Get("/");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List invoices by customer, building, or both");
    }

    public override Task HandleAsync(ListInvoicesRequest request, CancellationToken ct)
    {
        var invoices = Data.Invoices.List(request.BuildingId, request.CustomerId);

        return Send.OkAsync(invoices, ct);
    }
}
