using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Necto;

/// <summary>Opt-in generated metadata routes. Apply the host's authorization policy to each returned builder.</summary>
public sealed record NectoGeneratedMetadata(string ConfigurationKey)
{
    public static RouteHandlerBuilder Register(IEndpointRouteBuilder endpoints, RouteHandlerBuilder route, string key) =>
        route.WithMetadata(new NectoGeneratedMetadata(key));

    internal static IReadOnlyDictionary<string, string> Discover(IEnumerable<EndpointDataSource> sources, PathString pathBase)
    {
        var routes = sources.SelectMany(source => source.Endpoints).OfType<RouteEndpoint>()
            .Where(route => route.RoutePattern.Parameters.Count == 0 && route.RoutePattern.RawText is not null)
            .Select(route => (Key: route.Metadata.GetMetadata<NectoGeneratedMetadata>()?.ConfigurationKey,
                Path: "/" + route.RoutePattern.RawText!.TrimStart('/')))
            .Where(route => route.Key is "entityCatalogUrl" or "operationRolesUrl");
        return routes.GroupBy(route => route.Key!).Where(group => group.Select(route => route.Path).Distinct().Count() == 1)
            .ToDictionary(group => group.Key, group => pathBase.Add(new PathString(group.First().Path)).ToUriComponent());
    }
}
