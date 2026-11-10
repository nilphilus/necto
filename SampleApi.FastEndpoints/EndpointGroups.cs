using FastEndpoints;

namespace SampleApi.FastEndpoints;

public sealed class CustomersGroup : Group
{
    public CustomersGroup() =>
        Configure("customers", endpoint => endpoint.Description(builder => builder.WithTags("Customers")));
}

public sealed class AssetsGroup : Group
{
    public AssetsGroup() =>
        Configure("assets", endpoint => endpoint.Description(builder => builder.WithTags("Assets")));
}

public sealed class InvoicesGroup : Group
{
    public InvoicesGroup() =>
        Configure("invoices", endpoint => endpoint.Description(builder => builder.WithTags("Invoices")));
}

public sealed class WeatherGroup : Group
{
    public WeatherGroup() =>
        Configure("weather", endpoint => endpoint.Description(builder => builder.WithTags("Weather")));
}
