using FastEndpoints;

namespace SampleApi.FastEndpoints.Assets;

public sealed class ListAssetsRequest
{
    [QueryParam]
    public int? CustomerId { get; init; }
}

public sealed class ListAssets : Endpoint<ListAssetsRequest, Asset[]>
{
    public override void Configure()
    {
        Get("/");
        Group<AssetsGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List assets, optionally by customer");
    }

    public override Task HandleAsync(ListAssetsRequest request, CancellationToken ct)
    {
        var assets = Asset.Samples
            .Where(asset => request.CustomerId is null || asset.CustomerId == request.CustomerId)
            .ToArray();

        return Send.OkAsync(assets, ct);
    }
}
