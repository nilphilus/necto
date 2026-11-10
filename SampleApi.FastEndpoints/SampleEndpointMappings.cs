using FastEndpoints;
using Necto;
using SampleApi.FastEndpoints.Assets;
using SampleApi.FastEndpoints.Customers;
using SampleApi.FastEndpoints.Invoices;
using SampleApi.FastEndpoints.Weather;

namespace SampleApi.FastEndpoints;

internal static class SampleEndpointMappings
{
    public static EndpointMapping[] Create() =>
    [
        Link<ListCustomers, GetCustomer>("id", "path", "customerId", eachItem: true),
        Link<ListCustomers, SearchCustomers>("id", "body", "customerId", eachItem: true),
        Link<ListCustomers, ListAssets>("id", "query", "customerId", eachItem: true),
        Link<GetCustomer, ListAssets>("id", "query", "customerId"),
        Link<GetCustomer, ListInvoices>("id", "query", "customerId"),
        Link<SearchCustomers, ListAssets>("id", "query", "customerId"),
        Link<ListAssets, GetAsset>("id", "path", "assetId", eachItem: true),
        Link<ListAssets, ListInvoices>("id", "query", "assetId", eachItem: true),
        Link<GetAsset, GetCustomer>("customerId", "path", "customerId"),
        Link<GetAsset, ListInvoices>("id", "query", "assetId"),
        Link<GetAsset, GetWeatherForecast>("locationId", "path", "locationId"),
        Link<ListInvoices, GetInvoice>("id", "path", "invoiceId", eachItem: true),
        Link<GetInvoice, GetCustomer>("customerId", "path", "customerId"),
        Link<GetInvoice, GetAsset>("assetId", "path", "assetId"),
        Link<ListWeatherLocations, GetWeatherForecast>("id", "path", "locationId", eachItem: true)
    ];

    private static EndpointMapping Link<TSource, TTarget>(
        string property, string location, string parameter, bool eachItem = false)
        where TSource : IEndpoint
        where TTarget : IEndpoint =>
        new(
            new(IEndpoint.GetName<TSource>(), eachItem, property),
            new(IEndpoint.GetName<TTarget>(), location, parameter),
            "name",
            null);
}
