using FastEndpoints;
using FluentValidation;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class CreateInvoiceLineRequest : TenantRequest
{
    [RouteParam]
    public int InvoiceId { get; init; }

    public int AssetId { get; init; }
    public string Description { get; init; } = "";
    public int Quantity { get; init; }
    public decimal UnitPrice { get; init; }

    internal InvoiceLineInput Line => new()
    {
        AssetId = AssetId, Description = Description, Quantity = Quantity, UnitPrice = UnitPrice
    };
}

public sealed class CreateInvoiceLineValidator : Validator<CreateInvoiceLineRequest>
{
    public CreateInvoiceLineValidator() =>
        RuleFor(request => request.Line).SetValidator(new InvoiceLineInputValidator());
}

public sealed class CreateInvoiceLine : TenantEndpoint<CreateInvoiceLineRequest, Invoice>
{
    public override void Configure()
    {
        Post("/{invoiceId:int}/lines");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary =>
        {
            summary.Summary = "Add an asset to a draft invoice";
            summary.ExampleRequest = new CreateInvoiceLineRequest
            {
                AssetId = 12, Description = "Ventilation service", Quantity = 1, UnitPrice = 75m
            };
        });
        Description(builder => builder.Produces<Invoice>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status409Conflict));
    }

    public override async Task HandleAsync(CreateInvoiceLineRequest request, CancellationToken ct)
    {
        var invoice = Data.Invoices.Find(request.InvoiceId);
        if (invoice is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var asset = Data.Assets.FirstOrDefault(asset => asset.Id == request.AssetId);
        if (asset is null || asset.BuildingId != invoice.BuildingId)
        {
            AddError("The line must reference an asset in the invoice building.");
            await Send.ErrorsAsync(cancellation: ct);
            return;
        }

        (AddLineResult Status, Invoice? Invoice) result;
        try
        {
            result = Data.Invoices.AddLine(request.InvoiceId, request.Line.ToLine(asset));
        }
        catch (OverflowException)
        {
            AddError("The invoice total is too large.");
            await Send.ErrorsAsync(cancellation: ct);
            return;
        }

        if (result.Invoice is { } updated)
        {
            await Send.CreatedAtAsync<GetInvoice>(new { invoiceId = updated.Id }, updated, cancellation: ct);
            return;
        }

        var detail = result.Status == AddLineResult.Issued
            ? "Only draft invoices can be changed."
            : "The asset is already on this invoice.";
        await Send.ResultAsync(Results.Problem(statusCode: 409, detail: detail));
    }
}
