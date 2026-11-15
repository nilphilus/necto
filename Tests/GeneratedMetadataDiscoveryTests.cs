using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Necto;
public sealed class GeneratedMetadataDiscoveryTests
{
    [Fact]
    public async Task DiscoveryRespectsPathBaseAndDoesNotOverrideCoreConfiguration()
    {
        await using var app=WebApplication.CreateBuilder().Build();
        app.MapGet("/catalog",()=>"").WithMetadata(new NectoGeneratedMetadata("entityCatalogUrl"));
        app.MapGet("/roles",()=>"").WithMetadata(new NectoGeneratedMetadata("operationRolesUrl"));
        app.MapGet("/override",()=>"").WithMetadata(new NectoGeneratedMetadata("openApiUrl"));
        var result=NectoGeneratedMetadata.Discover(((IEndpointRouteBuilder)app).DataSources,new PathString("/tenant"));
        Assert.Equal("/tenant/catalog",result["entityCatalogUrl"]);Assert.Equal("/tenant/roles",result["operationRolesUrl"]);Assert.False(result.ContainsKey("openApiUrl"));
    }
    [Fact]
    public async Task AmbiguousAndParameterizedRoutesAreNotAdvertised()
    {
        await using var app=WebApplication.CreateBuilder().Build();
        foreach(var path in new[]{"/first","/second"})app.MapGet(path,()=>"").WithMetadata(new NectoGeneratedMetadata("entityCatalogUrl"));
        app.MapGet("/roles/{tenant}",()=>"").WithMetadata(new NectoGeneratedMetadata("operationRolesUrl"));
        Assert.Empty(NectoGeneratedMetadata.Discover(((IEndpointRouteBuilder)app).DataSources,PathString.Empty));
    }
}
