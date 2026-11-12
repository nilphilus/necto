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

    [Theory]
    [InlineData("/necto/api")]
    [InlineData("/necto/api/endpoint/GET%20%2Finvoices%2F%7BinvoiceId%7D%2Flines")]
    [InlineData("/necto/scenarios")]
    [InlineData("/necto/scenarios/saved-scenario/steps/2")]
    [InlineData("/necto/agent")]
    [InlineData("/necto/entities")]
    [InlineData("/necto/endpoints")]
    public async Task WorkspaceDeepLinksServeTheUiWithAssetsRelativeToItsMountPoint(string path)
    {
        var html = await client.GetStringAsync(path);
        Assert.Contains("<base href=\"/necto/\">", html);
        var script = System.Text.RegularExpressions.Regex.Match(html, "src=\"(\\./assets/[^\"]+)\"");
        Assert.True(script.Success);
        using var asset = await client.GetAsync("/necto/" + script.Groups[1].Value[2..]);
        asset.EnsureSuccessStatusCode();
    }

    [Fact]
    public void OptionalApiIdsRoundTripWithoutChangingExistingMappingJson()
    {
        var mapping = new EndpointMapping(new("Invoices", true, "id"),
            new("InvoiceLines", "parameter", "invoiceId"), "name", "InvoiceId");
        var options = System.Text.Json.JsonSerializerOptions.Web;
        var original = System.Text.Json.JsonSerializer.SerializeToNode(mapping, options)!;
        Assert.False(original["source"]!.AsObject().ContainsKey("apiId"));
        Assert.False(original["target"]!.AsObject().ContainsKey("apiId"));
        var crossApi = mapping with
        {
            Source = mapping.Source with { ApiId = "local" },
            Target = mapping.Target with { ApiId = "billing" }
        };
        var json = System.Text.Json.JsonSerializer.Serialize(crossApi, options);
        Assert.Equal(crossApi, System.Text.Json.JsonSerializer.Deserialize<EndpointMapping>(json, options));
    }

    [Fact]
    public async Task LargePayloadIsOneCompleteResponseWithReusableIdentifiers()
    {
        var payload = await client.GetFromJsonAsync<JsonArray>("/invoices/large-payload?count=26&noteSize=128");
        Assert.Equal(26, payload!.Count);
        Assert.Equal(100025, payload[25]!["lineId"]!.GetValue<int>());
        Assert.Equal(128, payload[25]!["notes"]!.GetValue<string>().Length);
        var detail = await client.GetFromJsonAsync<JsonObject>("/invoices/large-lines/100025");
        Assert.Equal(100025, detail!["lineId"]!.GetValue<int>());
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings");
        Assert.Contains(mappings!, mapping => mapping.Source.OperationId == "LargeInvoiceLines"
            && mapping.Source.EachItem && mapping.Source.Property == "lineId"
            && mapping.Target.OperationId == "LargeInvoiceLine");
    }

    [Fact]
    public async Task DescribesSelectableObjectsInNestedResponseArrays()
    {
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings");
        var mapping = Assert.Single(mappings!, mapping => mapping.Source.OperationId == "InvoicePreview"
            && mapping.Source.Property == "lineId" && mapping.Target.OperationId == "InvoiceLine");
        Assert.Equal(new string?[] { "invoice-lines", null }, mapping.Source.ObjectPath);
        var response = await client.GetFromJsonAsync<JsonObject>("/invoices/preview");
        Assert.Equal(18, response!["invoice-lines"]![1]![mapping.Source.Property!]!.GetValue<int>());
    }

    [Fact]
    public async Task SuggestsLinksByNameTypeAndAttribute()
    {
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings");

        Assert.NotNull(mappings);
        Assert.Contains(new EndpointMapping(new("Invoices", true, "id"),
            new("InvoiceLines", "parameter", "invoiceId"), "name", "InvoiceId"), mappings);
        Assert.Contains(new EndpointMapping(new("InvoiceLines", true, "lineId"),
            new("InvoiceLine", "parameter", "lineId"), "name", "LineId"), mappings);
        Assert.Contains(new EndpointMapping(new("InvoiceLine", false, "detailId"),
            new("InvoiceLineDetails", "parameter", "detailId"), "name", "DetailId"), mappings);
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
        Assert.True(invoices!.Count >= 10);
        var invoiceId = invoices[0]!["id"]!.GetValue<int>();
        var invoiceLines = await client.GetFromJsonAsync<JsonArray>($"/invoices/{invoiceId}/lines");
        Assert.True(invoiceLines!.Count >= 10);
        foreach (var entry in invoiceLines)
        {
            Assert.Equal(invoiceId, entry!["invoiceId"]!.GetValue<int>());
            var lineId = entry["lineId"]!.GetValue<int>();
            var line = await client.GetFromJsonAsync<JsonObject>($"/invoices/lines/{lineId}");
            var detailId = line!["detailId"]!.GetValue<int>();
            var details = await client.GetFromJsonAsync<JsonObject>($"/invoices/line-details/{detailId}");
            Assert.Equal(lineId, details!["lineId"]!.GetValue<int>());
            Assert.Equal(line["quantity"]!.GetValue<int>() * details["unitPrice"]!.GetValue<decimal>(),
                details["netAmount"]!.GetValue<decimal>());
        }

        var customers = await client.GetFromJsonAsync<JsonArray>("/customers");
        var customerId = Assert.Single(customers!)!["id"]!;
        using var result = await client.PostAsJsonAsync("/customers/search", new { selectedCustomer = customerId });
        result.EnsureSuccessStatusCode();
        var customer = await result.Content.ReadFromJsonAsync<JsonObject>();
        Assert.True(JsonNode.DeepEquals(customerId, customer!["id"]));
    }
}
