using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

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

    internal static void ApplyAttribute(IServiceProvider services, Attribute attribute)
    {
        var conventions = Conventions.GetOrCreateValue(services);
        conventions.Attributes.Add(attribute);
        foreach (var route in conventions.Routes)
            route.WithMetadata(attribute);
    }

    private sealed class RouteConventions
    {
        public List<Attribute> Attributes { get; } = [];
        public List<RouteHandlerBuilder> Routes { get; } = [];
    }
}
