using FastEndpoints;
using FluentValidation;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class CreateInvoiceRequest
{
    public int CustomerId { get; init; }
    public int AssetId { get; init; }
    public string Description { get; init; } = "";
    public string Currency { get; init; } = "";
    public InvoiceLineInput[] Lines { get; init; } = [];
}

public class InvoiceLineInput
{
    public string Description { get; init; } = "";
    public int Quantity { get; init; }
    public decimal UnitPrice { get; init; }
}

internal sealed class InvoiceLineInputValidator : AbstractValidator<InvoiceLineInput>
{
    public InvoiceLineInputValidator()
    {
        RuleFor(line => line.Description).NotEmpty();
        RuleFor(line => line.Quantity).GreaterThan(0);
        RuleFor(line => line.UnitPrice).GreaterThanOrEqualTo(0);
    }
}

public sealed class CreateInvoiceValidator : Validator<CreateInvoiceRequest>
{
    public CreateInvoiceValidator()
    {
        RuleFor(request => request.CustomerId).GreaterThan(0);
        RuleFor(request => request.AssetId).GreaterThan(0);
        RuleFor(request => request.Description).NotEmpty();
        RuleFor(request => request.Currency).NotEmpty().Matches("^[A-Z]{3}$");
        RuleFor(request => request.Lines).NotNull();
        RuleForEach(request => request.Lines).NotNull().SetValidator(new InvoiceLineInputValidator());
    }
}

public sealed class CreateInvoice : Endpoint<CreateInvoiceRequest, Invoice>
{
    public override void Configure()
    {
        Post("/");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Create an invoice with line items");
        Description(builder => builder.Produces<Invoice>(StatusCodes.Status201Created));
    }

    public override async Task HandleAsync(CreateInvoiceRequest request, CancellationToken ct)
    {
        Invoice invoice;
        try
        {
            invoice = Resolve<InvoiceStore>().Create(request);
        }
        catch (OverflowException)
        {
            AddError("The invoice total is too large.");
            await Send.ErrorsAsync(cancellation: ct);
            return;
        }

        await Send.CreatedAtAsync<GetInvoice>(new { invoiceId = invoice.Id }, invoice, cancellation: ct);
    }
}
