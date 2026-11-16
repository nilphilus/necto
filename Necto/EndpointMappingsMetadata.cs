using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Http;

namespace Necto;

/// <summary>Identifies a route serving Necto endpoint mappings.</summary>
public sealed class EndpointMappingsMetadata
{
    private static readonly ConditionalWeakTable<IServiceProvider, RouteConventions> Conventions = new();

    /// <summary>Registers a mappings route for discovery and shared Necto UI metadata.</summary>
    public static RouteHandlerBuilder Register(IEndpointRouteBuilder endpoints, RouteHandlerBuilder route)
    {
        var conventions = Conventions.GetOrCreateValue(endpoints.ServiceProvider);
        route.WithMetadata(new EndpointMappingsMetadata());
        foreach (var attribute in conventions.Attributes)
            route.WithMetadata(attribute);
        conventions.Routes.Add(route);
        return route;
    }

    /// <summary>Maps generated values once per route builder and path, preserving endpoint conventions.</summary>
    public static RouteHandlerBuilder Map(IEndpointRouteBuilder endpoints, string pattern, EndpointMapping[] mappings) =>
        MapResolved(endpoints, pattern, () => mappings);

    /// <summary>Maps a single route that resolves generated values when requested.</summary>
    public static RouteHandlerBuilder MapResolved(IEndpointRouteBuilder endpoints, string pattern, Func<EndpointMapping[]> resolveMappings)
    {
        var conventions = Conventions.GetOrCreateValue(endpoints.ServiceProvider);
        var key = (endpoints, pattern);
        if (conventions.GeneratedRoutes.TryGetValue(key, out var existing)) return existing;
        var route = Register(endpoints, endpoints.MapGet(pattern,
            () => Results.Json(resolveMappings(), System.Text.Json.JsonSerializerOptions.Web)).ExcludeFromDescription());
        conventions.GeneratedRoutes.Add(key, route);
        return route;
    }

    internal static bool HasMappings(IServiceProvider services) =>
        Conventions.TryGetValue(services, out var conventions) && conventions.Routes.Count > 0;

    internal static void ApplyAttribute(IServiceProvider services, Attribute attribute)
    {
        var conventions = Conventions.GetOrCreateValue(services);
        conventions.Attributes.Add(attribute);
        foreach (var route in conventions.Routes)
            route.WithMetadata(attribute);
    }

    private sealed class RouteConventions
    {
        public Dictionary<(IEndpointRouteBuilder, string), RouteHandlerBuilder> GeneratedRoutes { get; } = [];
        public List<Attribute> Attributes { get; } = [];
        public List<RouteHandlerBuilder> Routes { get; } = [];
    }
}
