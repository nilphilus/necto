using FastEndpoints;

namespace SampleApi.FastEndpoints.Customers;

public sealed class ListCustomers : TenantEndpoint<TenantRequest, Customer[]>
{
    public override void Configure()
    {
        Get("/");
        Group<CustomersGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List customers");
    }

    public override Task HandleAsync(TenantRequest request, CancellationToken ct) =>
        Send.OkAsync(Data.Customers, ct);
}
