using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Necto;
public sealed class FinalAccessMetadataTests
{
    [Fact] public async Task FinalMetadataCanRemoveCompiledAnonymousAndAuthorizeDeclarations()
    {
        var builder=WebApplication.CreateBuilder();builder.WebHost.UseTestServer();
        builder.Services.AddOpenApi(options=>NectoAccessHints.Add(options,[new("NowProtected",true,[]),new("NowPublic",false,[new("OldPolicy",null,null)])]));
        await using var app=builder.Build();app.MapOpenApi();
        app.MapGet("/protected",()=>42).WithName("NowProtected").WithMetadata(new AuthorizeAttribute {Policy="CurrentPolicy"});
        app.MapGet("/public",()=>42).WithName("NowPublic");
        await app.StartAsync();using var client=app.GetTestClient();
        var doc=await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json");
        var protectedHint=doc!["paths"]!["/protected"]!["get"]!["x-necto-access"]!;
        Assert.False(protectedHint["anonymousOverride"]!.GetValue<bool>());Assert.True(protectedHint["requiresAuthorization"]!.GetValue<bool>());
        Assert.Equal("CurrentPolicy",protectedHint["rules"]![0]!["policy"]!.GetValue<string>());
        Assert.False(doc["paths"]!["/public"]!["get"]!["x-necto-access"]!["requiresAuthorization"]!.GetValue<bool>());
    }
}
