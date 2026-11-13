using System.Net;
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
}
