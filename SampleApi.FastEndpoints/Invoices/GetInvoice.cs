using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class GetInvoiceRequest
{
    [RouteParam]
    public int InvoiceId { get; init; }
}

public sealed class GetInvoice : Endpoint<GetInvoiceRequest, Invoice>
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
        var invoice = Invoice.Samples.FirstOrDefault(invoice => invoice.Id == request.InvoiceId);

        return invoice is null ? Send.NotFoundAsync(ct) : Send.OkAsync(invoice, ct);
    }
}
