using FastEndpoints;

namespace SampleApi.FastEndpoints.Assets;

public sealed class ListAssetsRequest : TenantRequest
{
    [QueryParam]
    public int? BuildingId { get; init; }
}

public sealed class ListAssets : TenantEndpoint<ListAssetsRequest, Asset[]>
{
    public override void Configure()
    {
        Get("/");
        Group<AssetsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List assets, optionally by building");
    }

    public override Task HandleAsync(ListAssetsRequest request, CancellationToken ct)
    {
        var assets = Data.Assets
            .Where(asset => request.BuildingId is null || asset.BuildingId == request.BuildingId)
            .ToArray();

        return Send.OkAsync(assets, ct);
    }
}
