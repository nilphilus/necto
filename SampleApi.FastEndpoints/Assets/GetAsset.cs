using FastEndpoints;

namespace SampleApi.FastEndpoints.Assets;

public sealed class GetAssetRequest : TenantRequest
{
    [RouteParam]
    public int AssetId { get; init; }
}

public sealed class GetAsset : TenantEndpoint<GetAssetRequest, Asset>
{
    public override void Configure()
    {
        Get("/{assetId:int}");
        Group<AssetsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get asset details and its building");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetAssetRequest request, CancellationToken ct)
    {
        var asset = Data.Assets.FirstOrDefault(asset => asset.Id == request.AssetId);

        return asset is null ? Send.NotFoundAsync(ct) : Send.OkAsync(asset, ct);
    }
}
