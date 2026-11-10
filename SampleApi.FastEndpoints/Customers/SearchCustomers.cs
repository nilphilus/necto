using FastEndpoints;
using FluentValidation;

namespace SampleApi.FastEndpoints.Customers;

public sealed class SearchCustomersRequest
{
    public int CustomerId { get; init; }
}

public sealed class SearchCustomersValidator : Validator<SearchCustomersRequest>
{
    public SearchCustomersValidator()
    {
        RuleFor(request => request.CustomerId).GreaterThan(0);
    }
}

public sealed class SearchCustomers : Endpoint<SearchCustomersRequest, Customer>
{
    public override void Configure()
    {
        Post("/search");
        Group<CustomersGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Find a customer by ID");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(SearchCustomersRequest request, CancellationToken ct)
    {
        var customer = Customer.Samples.FirstOrDefault(customer => customer.Id == request.CustomerId);

        return customer is null ? Send.NotFoundAsync(ct) : Send.OkAsync(customer, ct);
    }
}
