using FastEndpoints;
using Necto;
using SampleApi.FastEndpoints.Customers;

namespace SampleApi.FastEndpoints.Buildings;

public sealed record Building(int Id, string Name, Customer Owner)
{
    public int OwnerCustomerId => Owner.Id;
}

public sealed class ListBuildingsRequest : TenantRequest
{
    [QueryParam, EndpointValue("CustomerId")]
    public int? OwnerCustomerId { get; init; }
}

public sealed class ListBuildings : TenantEndpoint<ListBuildingsRequest, Building[]>
{
    public override void Configure()
    {
        Get("/");
        Group<BuildingsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List buildings and their owners");
    }

    public override Task HandleAsync(ListBuildingsRequest request, CancellationToken ct) =>
        Send.OkAsync(Data.Buildings
            .Where(building => request.OwnerCustomerId is null || building.OwnerCustomerId == request.OwnerCustomerId)
            .ToArray(), ct);
}

public sealed class GetBuildingRequest : TenantRequest
{
    [RouteParam]
    public int BuildingId { get; init; }
}

public sealed class GetBuilding : TenantEndpoint<GetBuildingRequest, Building>
{
    public override void Configure()
    {
        Get("/{buildingId:int}");
        Group<BuildingsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get a building and its owner");
    }

    public override Task HandleAsync(GetBuildingRequest request, CancellationToken ct)
    {
        var building = Data.Buildings.FirstOrDefault(building => building.Id == request.BuildingId);
        return building is null ? Send.NotFoundAsync(ct) : Send.OkAsync(building, ct);
    }
}
