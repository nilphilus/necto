using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class GetInvoiceRequest : TenantRequest
{
    [RouteParam]
    public int InvoiceId { get; init; }
}

public sealed class GetInvoice : TenantEndpoint<GetInvoiceRequest, Invoice>
{
    public override void Configure()
    {
        Get("/{invoiceId:int}");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get invoice details");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetInvoiceRequest request, CancellationToken ct)
    {
        var invoice = Data.Invoices.Find(request.InvoiceId);

        return invoice is null ? Send.NotFoundAsync(ct) : Send.OkAsync(invoice, ct);
    }
}
