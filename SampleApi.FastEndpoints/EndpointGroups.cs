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

public sealed class BuildingsGroup : Group
{
    public BuildingsGroup() =>
        Configure("buildings", endpoint => endpoint.Description(builder => builder.WithTags("Buildings")));
}
