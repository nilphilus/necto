using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
public sealed class GeneratedDocumentationTests:IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public GeneratedDocumentationTests(WebApplicationFactory<Program> factory)=>client=factory.CreateClient();
    [Fact]
    public async Task SourceXmlFillsOperationBodyModelAndRenamedPropertyDescriptions()
    {
        var doc=(await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json"))!;
        var operation=doc["paths"]!["/documented-invoices"]!["post"]!;
        Assert.Equal("Create an invoice from documented source code.",operation["summary"]!.GetValue<string>());
        Assert.Contains("**customer**",operation["description"]!.GetValue<string>());
        Assert.Equal("The invoice draft to create.",operation["requestBody"]!["description"]!.GetValue<string>());
        var schemas=doc["components"]!["schemas"]!.AsObject().Select(item=>item.Value!).ToArray();
        Assert.Contains(schemas,schema=>schema["description"]?.GetValue<string>()=="An invoice described in source XML comments.");
        Assert.Contains(schemas,schema=>schema["properties"]?["invoice-reference"]?["description"]?.GetValue<string>()=="The external invoice reference.");
    }
    [Fact]
    public async Task ExplicitAuthorContentIsNeverReplacedByGeneratorFallbacks()
    {
        var doc=(await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json"))!;var operation=doc["paths"]!["/documented-invoices/authored"]!["post"]!;
        Assert.Equal("Authored summary",operation["summary"]!.GetValue<string>());Assert.Equal("Authored description",operation["description"]!.GetValue<string>());
    }
}
