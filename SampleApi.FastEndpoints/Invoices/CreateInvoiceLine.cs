using FastEndpoints;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class CreateInvoiceLineRequest : InvoiceLineInput
{
    [RouteParam]
    public int InvoiceId { get; init; }
}

public sealed class CreateInvoiceLineValidator : Validator<CreateInvoiceLineRequest>
{
    public CreateInvoiceLineValidator() => Include(new InvoiceLineInputValidator());
}

public sealed class CreateInvoiceLine : Endpoint<CreateInvoiceLineRequest, InvoiceLineItem>
{
    public override void Configure()
    {
        Post("/{invoiceId:int}/lines");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary =>
        {
            summary.Summary = "Add a line item to an invoice";
            summary.ExampleRequest = new CreateInvoiceLineRequest { InvoiceId = 501, Description = "Support", Quantity = 1, UnitPrice = 60m };
        });
        Description(builder => builder.Produces<InvoiceLineItem>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(CreateInvoiceLineRequest request, CancellationToken ct)
    {
        InvoiceLineItem? line;
        try
        {
            line = Resolve<InvoiceStore>().AddLine(request.InvoiceId, request);
        }
        catch (OverflowException)
        {
            AddError("The invoice total is too large.");
            await Send.ErrorsAsync(cancellation: ct);
            return;
        }

        if (line is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        await Send.CreatedAtAsync<InvoiceLine>(new { lineId = line.LineId }, line, cancellation: ct);
    }
}
