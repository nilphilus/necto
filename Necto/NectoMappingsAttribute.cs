using Microsoft.AspNetCore.Routing;

namespace Necto;

/// <summary>Connects an application's generated mappings to the Necto UI registration.</summary>
[AttributeUsage(AttributeTargets.Assembly)]
public abstract class NectoMappingsAttribute : Attribute
{
    /// <summary>Registers the application's generated mappings endpoint.</summary>
    public abstract void Map(IEndpointRouteBuilder endpoints);
}
