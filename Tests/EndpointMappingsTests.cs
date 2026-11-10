using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;

public sealed class EndpointMappingsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;

    public EndpointMappingsTests(WebApplicationFactory<Program> factory)
    {
        client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost")
        });
    }

    [Fact]
    public async Task SuggestsLinksByNameTypeAndAttribute()
    {
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings");

        Assert.NotNull(mappings);
        Assert.Contains(new EndpointMapping(new("Invoices", true, "id"),
            new("InvoiceLines", "parameter", "invoiceId"), "name", "InvoiceId"), mappings);
        Assert.Contains(new EndpointMapping(new("Customers", true, "id"),
            new("FindCustomer", "body", "selectedCustomer"), "type", null), mappings);
        Assert.Contains(new EndpointMapping(new("Invoices", true, "legacyNumber"),
            new("InvoiceByLegacyNumber", "parameter", "number"), "attribute", null), mappings);
        Assert.DoesNotContain(mappings, mapping => mapping.Source.OperationId == "Invoices"
            && mapping.Source.Property == "id" && mapping.Target.Name == "number");
    }

    [Fact]
    public async Task GeneratedLinksReferToOpenApiOperationsAndActualJson()
    {
        var configuration = await client.GetFromJsonAsync<JsonObject>("/necto/configuration");
        Assert.Equal("/necto/endpoint-mappings", configuration!["endpointMappingsUrl"]!.GetValue<string>());

        var openApi = await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json");
        var paths = openApi!["paths"]!.AsObject();
        Assert.Equal("Invoices", paths["/invoices"]!["get"]!["operationId"]!.GetValue<string>());
        var lines = paths["/invoices/{invoiceId}/lines"]!["get"]!;
        Assert.Equal("InvoiceLines", lines["operationId"]!.GetValue<string>());
        var parameter = Assert.Single(lines["parameters"]!.AsArray())!;
        Assert.Equal("invoiceId", parameter["name"]!.GetValue<string>());
        Assert.Equal("path", parameter["in"]!.GetValue<string>());
        Assert.False(paths.ContainsKey("/necto/endpoint-mappings"));

        var invoices = await client.GetFromJsonAsync<JsonArray>("/invoices");
        var invoiceId = Assert.Single(invoices!)!["id"]!.GetValue<int>();
        var invoiceLines = await client.GetFromJsonAsync<JsonArray>($"/invoices/{invoiceId}/lines");
        Assert.Equal(invoiceId, Assert.Single(invoiceLines!)!["invoiceId"]!.GetValue<int>());

        var customers = await client.GetFromJsonAsync<JsonArray>("/customers");
        var customerId = Assert.Single(customers!)!["id"]!;
        using var result = await client.PostAsJsonAsync("/customers/search", new { selectedCustomer = customerId });
        result.EnsureSuccessStatusCode();
        var customer = await result.Content.ReadFromJsonAsync<JsonObject>();
        Assert.True(JsonNode.DeepEquals(customerId, customer!["id"]));
    }
}
