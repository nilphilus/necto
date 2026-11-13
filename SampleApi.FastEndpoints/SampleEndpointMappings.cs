using FastEndpoints;
using Necto;
using SampleApi.FastEndpoints.Assets;
using SampleApi.FastEndpoints.Buildings;
using SampleApi.FastEndpoints.Customers;
using SampleApi.FastEndpoints.Invoices;

namespace SampleApi.FastEndpoints;

internal static class SampleEndpointMappings
{
    public static EndpointMapping[] Create() =>
    [
        Link<ListCustomers, GetCustomer>("id", "path", "customerId", eachItem: true),
        Link<ListCustomers, ListBuildings>("id", "query", "ownerCustomerId", eachItem: true),
        Link<GetCustomer, ListBuildings>("id", "query", "ownerCustomerId"),
        Link<GetCustomer, ListInvoices>("id", "query", "customerId"),
        Link<ListBuildings, GetBuilding>("id", "path", "buildingId", eachItem: true),
        Link<ListBuildings, ListInvoices>("id", "query", "buildingId", eachItem: true),
        Link<ListBuildings, ListAssets>("id", "query", "buildingId", eachItem: true),
        Link<GetBuilding, ListInvoices>("id", "query", "buildingId"),
        Link<GetBuilding, GetCustomer>("ownerCustomerId", "path", "customerId"),
        Link<GetBuilding, ListAssets>("id", "query", "buildingId"),
        Link<GetBuilding, CreateInvoice>("id", "body", "buildingId"),
        Link<ListAssets, GetAsset>("id", "path", "assetId", eachItem: true),
        Link<ListAssets, CreateInvoiceLine>("id", "body", "assetId", eachItem: true),
        Link<GetAsset, GetBuilding>("buildingId", "path", "buildingId"),
        Link<GetAsset, CreateInvoiceLine>("id", "body", "assetId"),
        Link<ListInvoices, GetInvoice>("id", "path", "invoiceId", eachItem: true),
        Link<GetInvoice, GetBuilding>("buildingId", "path", "buildingId"),
        Link<GetInvoice, GetCustomer>("customerId", "path", "customerId"),
        Link<GetInvoice, GetAsset>("assetId", "path", "assetId", objectPath: ["lines", null]),
        Link<CreateInvoice, CreateInvoiceLine>("id", "path", "invoiceId"),
        Link<CreateInvoice, GetInvoice>("id", "path", "invoiceId"),
        Link<CreateInvoiceLine, GetInvoice>("id", "path", "invoiceId")
    ];

    private static EndpointMapping Link<TSource, TTarget>(
        string property, string location, string parameter, bool eachItem = false, string?[]? objectPath = null)
        where TSource : IEndpoint
        where TTarget : IEndpoint =>
        new(
            new(IEndpoint.GetName<TSource>(), eachItem, property) { ObjectPath = objectPath },
            new(IEndpoint.GetName<TTarget>(), location, parameter),
            "name",
            null);
}
