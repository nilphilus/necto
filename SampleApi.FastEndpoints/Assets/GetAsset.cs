using FastEndpoints;

namespace SampleApi.FastEndpoints.Assets;

public sealed class GetAssetRequest
{
    [RouteParam]
    public int AssetId { get; init; }
}

public sealed class GetAsset : Endpoint<GetAssetRequest, Asset>
{
    public override void Configure()
    {
        Get("/{assetId:int}");
        Group<AssetsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get asset details and its installation location");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetAssetRequest request, CancellationToken ct)
    {
        var asset = Asset.Samples.FirstOrDefault(asset => asset.Id == request.AssetId);

        return asset is null ? Send.NotFoundAsync(ct) : Send.OkAsync(asset, ct);
    }
}
