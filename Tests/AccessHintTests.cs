using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;
public sealed class AccessHintTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact] public void RoleAlternativesStayGroupedAndAnonymousOverrideWins()
    {
        var rules=new[]{new NectoAccessRule("Read","Reader,Admin",null),new NectoAccessRule("Tenant",null,null)};
        var hint=NectoAccessHints.Describe(false,rules,true);Assert.True(hint["requiresAuthorization"]!.GetValue<bool>());Assert.Equal(2,hint["rules"]!.AsArray().Count);Assert.Equal(2,hint["rules"]![0]!["anyRole"]!.AsArray().Count);
        Assert.False(NectoAccessHints.Describe(true,rules,true)["requiresAuthorization"]!.GetValue<bool>());
    }
    [Fact] public async Task RuntimeAllowAnonymousOverridesCompiledAuthorizeMetadata()
    {
        var doc=await factory.CreateClient().GetFromJsonAsync<JsonObject>("/openapi/v1.json");
        var hint=doc!["paths"]!["/invoices/access-hints"]!["get"]!["x-necto-access"]!;
        Assert.True(hint["anonymousOverride"]!.GetValue<bool>());Assert.False(hint["requiresAuthorization"]!.GetValue<bool>());
    }
}
