using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
public sealed class ResponseWrapperTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact] public async Task GeneratedWrapperUsesSerializedNamesAndKeepsNestedMappings()
    {
        var client=factory.CreateClient();var doc=await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json");
        Assert.Contains("x-necto-collection",doc!.ToJsonString());
        var response=await client.GetFromJsonAsync<JsonObject>("/invoices/wrapped");Assert.Equal(500,response!["totalCount"]!.GetValue<int>());
        var mappings=await client.GetStringAsync("/necto/endpoint-mappings");Assert.Contains("WrappedInvoices",mappings);Assert.Contains("items",mappings);
    }
}
