using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Necto;

/// <summary>Identifies generated metadata routes for discovery and shared Necto UI metadata.</summary>
public sealed record NectoGeneratedMetadata(string ConfigurationKey)
{
    private static readonly ConditionalWeakTable<IServiceProvider, RouteConventions> Conventions = new();

    public static RouteHandlerBuilder Register(IEndpointRouteBuilder endpoints, RouteHandlerBuilder route, string key)
    {
        var conventions = Conventions.GetOrCreateValue(endpoints.ServiceProvider);
        route.WithMetadata(new NectoGeneratedMetadata(key));
        foreach (var attribute in conventions.Attributes) route.WithMetadata(attribute);
        conventions.Routes.Add((key, route));
        return route;
    }

    /// <summary>Maps an entity catalog once per route builder and path.</summary>
    public static RouteHandlerBuilder MapEntityCatalog(IEndpointRouteBuilder endpoints, string pattern, Func<EntityCatalogEntry[]> resolveCatalog)
    {
        var conventions = Conventions.GetOrCreateValue(endpoints.ServiceProvider);
        var key = (endpoints, pattern);
        if (conventions.CatalogRoutes.TryGetValue(key, out var existing)) return existing;
        var route = Register(endpoints, endpoints.MapGet(pattern,
            () => Results.Json(resolveCatalog(), System.Text.Json.JsonSerializerOptions.Web)).ExcludeFromDescription(), "entityCatalogUrl");
        conventions.CatalogRoutes.Add(key, route);
        return route;
    }

    internal static bool HasEntityCatalog(IServiceProvider services) =>
        Conventions.TryGetValue(services, out var conventions) && conventions.Routes.Any(route => route.Key == "entityCatalogUrl");

    internal static void ApplyAttribute(IServiceProvider services, Attribute attribute)
    {
        var conventions = Conventions.GetOrCreateValue(services);
        conventions.Attributes.Add(attribute);
        foreach (var route in conventions.Routes) route.Builder.WithMetadata(attribute);
    }

    private sealed class RouteConventions
    {
        public Dictionary<(IEndpointRouteBuilder, string), RouteHandlerBuilder> CatalogRoutes { get; } = [];
        public List<Attribute> Attributes { get; } = [];
        public List<(string Key, RouteHandlerBuilder Builder)> Routes { get; } = [];
    }

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
