using FastEndpoints;

namespace SampleApi.FastEndpoints.Customers;

public sealed class GetCustomerRequest
{
    [RouteParam]
    public int CustomerId { get; init; }
}

public sealed class GetCustomer : Endpoint<GetCustomerRequest, Customer>
{
    public override void Configure()
    {
        Get("/{customerId:int}");
        Group<CustomersGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get customer details");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetCustomerRequest request, CancellationToken ct)
    {
        var customer = Customer.Samples.FirstOrDefault(customer => customer.Id == request.CustomerId);

        return customer is null ? Send.NotFoundAsync(ct) : Send.OkAsync(customer, ct);
    }
}
