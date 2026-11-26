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
        var builderPage = await client.GetAsync("/docs/builder");
        Assert.Equal(HttpStatusCode.OK, builderPage.StatusCode);
        Assert.Contains("<base href=\"/docs/\">", await builderPage.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/docs/assets/missing.js")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/protected")).StatusCode);
    }

    [Theory]
    [InlineData("automatic")]
    [InlineData("manual-before")]
    [InlineData("manual-after")]
    [InlineData("custom-before")]
    [InlineData("custom-after")]
    public async Task ConvenienceRegistrationServesGeneratedMappingsWithoutDuplicateRoutes(string mode)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(Program).Assembly.GetName().Name
        });
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        var provider = System.Reflection.CustomAttributeExtensions
            .GetCustomAttribute<NectoMappingsAttribute>(typeof(Program).Assembly)!;
        const string custom = "/custom/mappings";
        if (mode == "manual-before") provider.Map(app);
        if (mode == "custom-before") EndpointMappingsMetadata.Map(app, custom, []);
        app.UseNectoUI(endpointMappingsPath: mode == "custom-after" ? custom : null,
            metadataAttribute: new SkipRequiredHeaderAttribute());
        if (mode == "manual-after") provider.Map(app);
        if (mode == "custom-after") EndpointMappingsMetadata.Map(app, custom, []);
        await app.StartAsync();
        using var client = app.GetTestClient();
        var expected = mode.StartsWith("custom") ? custom : "/necto/endpoint-mappings";
        var configuration = await client.GetFromJsonAsync<JsonObject>("/necto/configuration");
        Assert.Equal(expected, configuration!["endpointMappingsUrl"]!.GetValue<string>());
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>(expected);
        if (!mode.StartsWith("custom")) Assert.NotEmpty(mappings!);
        var routes = ((Microsoft.AspNetCore.Routing.IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .Where(endpoint => endpoint.Metadata.GetMetadata<EndpointMappingsMetadata>() is not null).ToArray();
        Assert.Single(routes);
        Assert.NotNull(routes[0].Metadata.GetMetadata<SkipRequiredHeaderAttribute>());
    }

    [Fact]
    public async Task ManualUiRegistrationDoesNotExposeMappingsAutomatically()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(Program).Assembly.GetName().Name
        });
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.MapNectoUI();
        await app.StartAsync();
        using var client = app.GetTestClient();
        var configuration = await client.GetFromJsonAsync<JsonObject>("/necto/configuration");
        Assert.False(configuration!.ContainsKey("endpointMappingsUrl"));
        Assert.False(configuration.ContainsKey("entityCatalogUrl"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/necto/endpoint-mappings")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/necto/entity-catalog")).StatusCode);
    }

    [Theory]
    [InlineData("automatic")]
    [InlineData("manual-before")]
    [InlineData("manual-after")]
    [InlineData("custom-before")]
    public async Task ConvenienceRegistrationServesCatalogWithSharedMetadata(string mode)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(Program).Assembly.GetName().Name
        });
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UsePathBase("/tenant");
        app.UseRouting();
        app.Use(async (context, next) =>
        {
            if (context.GetEndpoint()?.Metadata.GetMetadata<SkipRequiredHeaderAttribute>() is not null)
                await next(context);
            else
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
        });
        var provider = System.Reflection.CustomAttributeExtensions
            .GetCustomAttribute<NectoMappingsAttribute>(typeof(Program).Assembly)!;
        if (mode == "manual-before") provider.MapEntityCatalog(app);
        if (mode == "custom-before") NectoGeneratedMetadata.MapEntityCatalog(app, "/custom/catalog", () => []);
        app.UseNectoUI(metadataAttribute: new SkipRequiredHeaderAttribute());
        if (mode == "manual-after") provider.MapEntityCatalog(app);
        await app.StartAsync();

        using var client = app.GetTestClient();
        var expected = mode == "custom-before" ? "/tenant/custom/catalog" : "/tenant/necto/entity-catalog";
        var configuration = await client.GetFromJsonAsync<JsonObject>("/tenant/necto/configuration");
        Assert.Equal(expected, configuration!["entityCatalogUrl"]!.GetValue<string>());
        var catalog = await client.GetFromJsonAsync<EntityCatalogEntry[]>(expected);
        if (mode != "custom-before") Assert.NotEmpty(catalog!);
        var route = Assert.Single(((Microsoft.AspNetCore.Routing.IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints),
            endpoint => endpoint.Metadata.GetMetadata<NectoGeneratedMetadata>()?.ConfigurationKey == "entityCatalogUrl");
        Assert.NotNull(route.Metadata.GetMetadata<SkipRequiredHeaderAttribute>());
    }

    [Fact]
    public async Task ConfiguredOpenApiDocumentsUseTheApplicationPathBase()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UsePathBase("/tenant");
        app.MapNectoUI(openApiPath: "/openapi/v1.json", openApiDocuments: new Dictionary<string, string>
        {
            ["Version 1"] = "/openapi/v1.json",
            ["Version 2"] = "/swagger/v2/swagger.json",
        });
        await app.StartAsync();

        using var client = app.GetTestClient();
        var configuration = await client.GetFromJsonAsync<JsonObject>("/tenant/necto/configuration");
        Assert.Equal("/tenant/openapi/v1.json", configuration!["openApiUrl"]!.GetValue<string>());
        var documents = configuration["openApiDocuments"]!.AsArray();
        Assert.Collection(documents,
            item =>
            {
                Assert.Equal("Version 1", item!["name"]!.GetValue<string>());
                Assert.Equal("/tenant/openapi/v1.json", item["url"]!.GetValue<string>());
            },
            item =>
            {
                Assert.Equal("Version 2", item!["name"]!.GetValue<string>());
                Assert.Equal("/tenant/swagger/v2/swagger.json", item["url"]!.GetValue<string>());
            });
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
        void MapMappings()
        {
            EndpointMappingsMetadata.Register(app,
                app.MapGet(mappingsPath, () => Results.Json(Array.Empty<EndpointMapping>())));
            NectoGeneratedMetadata.MapEntityCatalog(app, "/custom/catalog", () => []);
        }

        if (!mapUiFirst) MapMappings();
        app.UseNectoUI(routePrefix: "/docs", metadataAttribute: new SkipRequiredHeaderAttribute());
        if (mapUiFirst) MapMappings();
        await app.StartAsync();

        using var client = app.GetTestClient();
        var configuration = await client.GetFromJsonAsync<JsonObject>("/docs/configuration");
        Assert.Equal(mappingsPath, configuration!["endpointMappingsUrl"]!.GetValue<string>());
        Assert.Empty((await client.GetFromJsonAsync<EndpointMapping[]>(mappingsPath))!);
        Assert.Equal("/custom/catalog", configuration["entityCatalogUrl"]!.GetValue<string>());
        Assert.Empty((await client.GetFromJsonAsync<EntityCatalogEntry[]>("/custom/catalog"))!);
    }
}
