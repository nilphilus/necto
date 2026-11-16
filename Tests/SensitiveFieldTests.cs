using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
public sealed class SensitiveFieldTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact] public async Task MetadataUsesWireNamesButDoesNotChangeTheLiveApiPayload()
    {
        var client=factory.CreateClient();var doc=await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json");
        var schema=doc!["components"]!["schemas"]!["SensitiveInvoice"]!;Assert.Contains("approval-code",schema["x-necto-sensitive-properties"]!.ToJsonString());
        using var response=await client.PostAsJsonAsync("/invoices/sensitive",new Dictionary<string,object> {{"reference","INV-42"},{"approval-code","demo-code"},{"contact",new{name="Demo",note="<xml>private</xml>"}}});
        response.EnsureSuccessStatusCode();var payload=await response.Content.ReadFromJsonAsync<JsonObject>();Assert.Equal("demo-code",payload!["approval-code"]!.GetValue<string>());
    }
}
