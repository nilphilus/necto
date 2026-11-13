using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Necto;

public sealed class NectoUIMetadataTests
{
    [Fact]
    public async Task HeaderValidationCanReadMetadataOnNectoUIRoutes()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();

        app.UseRouting();
        app.Use(async (context, next) =>
        {
            if (context.GetEndpoint()?.Metadata.GetMetadata<SkipRequiredHeaderAttribute>() is null &&
                !context.Request.Headers.ContainsKey("X-Required"))
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            await next(context);
        });

        app.MapNectoUI(routePrefix: "/docs").WithMetadata(new SkipRequiredHeaderAttribute());
        app.MapGet("/protected", () => "protected");
        await app.StartAsync();

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Redirect, (await client.GetAsync("/docs")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/docs/")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/docs/api/endpoint/example")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/docs/configuration")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/docs/assets/missing.js")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/protected")).StatusCode);
    }

    private sealed class SkipRequiredHeaderAttribute : Attribute;

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UseNectoUIAppliesTheAttributeToUiAndMappings(bool mapUiFirst)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UseRouting();
        app.Use(async (context, next) =>
        {
            if (context.GetEndpoint()?.Metadata.GetMetadata<SkipRequiredHeaderAttribute>() is not null)
                await next(context);
            else
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
        });

        const string mappingsPath = "/custom/mappings";
        void MapMappings() => EndpointMappingsMetadata.Register(app,
            app.MapGet(mappingsPath, () => Results.Json(Array.Empty<EndpointMapping>())));

        if (!mapUiFirst) MapMappings();
        app.UseNectoUI(routePrefix: "/docs", metadataAttribute: new SkipRequiredHeaderAttribute());
        if (mapUiFirst) MapMappings();
        await app.StartAsync();

        using var client = app.GetTestClient();
        var configuration = await client.GetFromJsonAsync<JsonObject>("/docs/configuration");
        Assert.Equal(mappingsPath, configuration!["endpointMappingsUrl"]!.GetValue<string>());
        Assert.Empty((await client.GetFromJsonAsync<EndpointMapping[]>(mappingsPath))!);
    }
}
