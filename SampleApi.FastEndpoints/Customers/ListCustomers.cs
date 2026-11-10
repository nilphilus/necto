using FastEndpoints;

namespace SampleApi.FastEndpoints.Customers;

public sealed class ListCustomers : EndpointWithoutRequest<IReadOnlyList<Customer>>
{
    public override void Configure()
    {
        Get("/");
        Group<CustomersGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List customers");
    }

    public override Task HandleAsync(CancellationToken ct) =>
        Send.OkAsync(Customer.Samples, ct);
}
