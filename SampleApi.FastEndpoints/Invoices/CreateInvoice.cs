using FastEndpoints;
using FluentValidation;
using SampleApi.FastEndpoints.Assets;

namespace SampleApi.FastEndpoints.Invoices;

public sealed class CreateInvoiceRequest : TenantRequest
{
    public int BuildingId { get; init; }
    public string Currency { get; init; } = "";
    public InvoiceLineInput[] Lines { get; init; } = [];
}

public sealed class InvoiceLineInput
{
    public int AssetId { get; init; }
    public string Description { get; init; } = "";
    public int Quantity { get; init; }
    public decimal UnitPrice { get; init; }

    internal InvoiceLine ToLine(Asset asset) => new(asset.Id, asset.Name, Description, Quantity, UnitPrice);
}

internal sealed class InvoiceLineInputValidator : AbstractValidator<InvoiceLineInput>
{
    public InvoiceLineInputValidator()
    {
        RuleFor(line => line.AssetId).GreaterThan(0);
        RuleFor(line => line.Description).NotEmpty();
        RuleFor(line => line.Quantity).GreaterThan(0);
        RuleFor(line => line.UnitPrice).GreaterThanOrEqualTo(0);
    }
}

public sealed class CreateInvoiceValidator : Validator<CreateInvoiceRequest>
{
    public CreateInvoiceValidator()
    {
        RuleFor(request => request.BuildingId).GreaterThan(0);
        RuleFor(request => request.Currency).NotEmpty().Matches("^[A-Z]{3}$");
        RuleFor(request => request.Lines).NotNull();
        RuleForEach(request => request.Lines).NotNull().SetValidator(new InvoiceLineInputValidator());
    }
}

public sealed class CreateInvoice : TenantEndpoint<CreateInvoiceRequest, Invoice>
{
    public override void Configure()
    {
        Post("/");
        Group<InvoicesGroup>();
        AllowAnonymous();
        Summary(summary =>
        {
            summary.Summary = "Create a draft invoice for a building";
            summary.ExampleRequest = new CreateInvoiceRequest
            {
                BuildingId = 101, Currency = "PLN",
                Lines = [new() { AssetId = 11, Description = "Lift inspection", Quantity = 2, UnitPrice = 150m }]
            };
        });
        Description(builder => builder.Produces<Invoice>(StatusCodes.Status201Created));
    }

    public override async Task HandleAsync(CreateInvoiceRequest request, CancellationToken ct)
    {
        var building = Data.Buildings.FirstOrDefault(building => building.Id == request.BuildingId);
        if (building is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var lines = new List<InvoiceLine>();
        var assetIds = new HashSet<int>();
        foreach (var input in request.Lines)
        {
            var asset = Data.Assets.FirstOrDefault(asset => asset.Id == input.AssetId);
            if (asset is null || asset.BuildingId != building.Id || !assetIds.Add(input.AssetId))
            {
                AddError("Each line must reference a distinct asset in the invoice building.");
                await Send.ErrorsAsync(cancellation: ct);
                return;
            }

            lines.Add(input.ToLine(asset));
        }

        Invoice invoice;
        try
        {
            invoice = Data.Invoices.Create(building, request.Currency, lines.ToArray());
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
