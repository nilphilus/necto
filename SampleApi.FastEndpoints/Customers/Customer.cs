namespace SampleApi.FastEndpoints.Customers;

public sealed record Customer(int Id, string Name)
{
    internal static IReadOnlyList<Customer> Samples { get; } =
        [new(7, "Contoso"), new(12, "Fabrikam")];
}
