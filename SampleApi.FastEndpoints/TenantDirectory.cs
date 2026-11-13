using FastEndpoints;
using SampleApi.FastEndpoints.Assets;
using SampleApi.FastEndpoints.Buildings;
using SampleApi.FastEndpoints.Customers;
using SampleApi.FastEndpoints.Invoices;

namespace SampleApi.FastEndpoints;

public class TenantRequest
{
    public const string HeaderName = "X-Tenant";

    [FromHeader(HeaderName)]
    public string Tenant { get; init; } = "";
}

public abstract class TenantEndpoint<TRequest, TResponse> : Endpoint<TRequest, TResponse>
    where TRequest : TenantRequest
{
    private protected TenantData Data => HttpContext.Features.Get<TenantData>()!;
}

internal sealed class TenantRequired;

internal sealed class TenantDirectory
{
    private readonly Dictionary<string, TenantData> tenants = new(StringComparer.Ordinal)
    {
        ["acme"] = new(new(7, "Vistula Property"), "Browarna 12", "Winda B12",
            "Wentylacja B12", "browarna-main", 150m, 75m, 502, 199),
        ["northstar"] = new(new(7, "Baltic Estates"), "Portowa 8", "Winda P8",
            "Wentylacja P8", "portowa-main", 200m, 90m, 503, 299)
    };

    public async Task SelectAsync(HttpContext context, RequestDelegate next)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<TenantRequired>() is null)
        {
            await next(context);
            return;
        }

        var header = context.Request.Headers[TenantRequest.HeaderName];
        if (header.Count != 1 || string.IsNullOrWhiteSpace(header[0]) || header[0]!.Contains(','))
        {
            await Results.Problem(statusCode: 400, detail: "Provide one X-Tenant header.").ExecuteAsync(context);
            return;
        }

        if (!tenants.TryGetValue(header[0]!, out var tenant))
        {
            await Results.Problem(statusCode: 404, detail: "Tenant not found.").ExecuteAsync(context);
            return;
        }

        context.Features.Set(tenant);
        await next(context);
    }
}

internal sealed class TenantData
{
    public Customer[] Customers { get; }
    public Building[] Buildings { get; }
    public Asset[] Assets { get; }
    public InvoiceStore Invoices { get; }

    public TenantData(Customer owner, string buildingName, string lift, string ventilation,
        string meterId, decimal liftPrice, decimal ventilationPrice, int previousInvoiceId, int annexAssetId)
    {
        Customers = [owner, new(8, "Previous owner")];
        Buildings = [new(101, buildingName, owner), new(102, $"{buildingName} – annex", owner)];
        Assets =
        [
            new(11, 101, lift, "Lift", null),
            new(12, 101, ventilation, "Ventilation", null),
            new(13, 101, "Main electricity meter", "Meter", meterId),
            new(annexAssetId, 102, "Annex electricity meter", "Meter", null)
        ];
        Invoices = new(
        [
            IssuedInvoice(501, owner, new(2026, 10, 31), liftPrice, ventilationPrice),
            IssuedInvoice(previousInvoiceId, Customers[1], new(2026, 9, 30), liftPrice, ventilationPrice)
        ]);
    }

    private Invoice IssuedInvoice(int id, Customer customer, DateOnly issuedOn, decimal liftPrice, decimal ventilationPrice) =>
        new(id, Buildings[0].Id, customer, Buildings[0].Name, "PLN", issuedOn,
        [
            new(Assets[0].Id, Assets[0].Name, "Lift inspection", 2, liftPrice),
            new(Assets[1].Id, Assets[1].Name, "Ventilation service", 1, ventilationPrice)
        ]);
}
