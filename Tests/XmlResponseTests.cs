using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;

public sealed class XmlResponseTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

    [Fact]
    public async Task XmlCollectionIsOneCompleteDocumentWithTheAdvertisedContentType()
    {
        using var response = await client.GetAsync("/invoices/xml-preview?count=60");
        response.EnsureSuccessStatusCode();
        Assert.Equal("application/xml", response.Content.Headers.ContentType!.MediaType);
        var xml = XDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(60, xml.Root!.Elements("invoice").Count());
        Assert.Equal("100059", xml.Root.Elements("invoice").Last().Attribute("id")!.Value);
    }

    [Fact]
    public async Task EmbeddedXmlRemainsAStringAndSurroundingJsonRetainsItsMappings()
    {
        var payload = await client.GetFromJsonAsync<JsonObject>("/invoices/42/xml-document");
        Assert.Equal(42, payload!["id"]!.GetValue<int>());
        var xml = XDocument.Parse(payload["document"]!.GetValue<string>());
        Assert.Equal("42", xml.Root!.Attribute("id")!.Value);
        var mappings = await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings");
        Assert.Contains(mappings!, mapping => mapping.Source.OperationId == "InvoiceXmlDocument" && mapping.Target.OperationId == "InvoiceLines");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/invoices/999999/xml-document")).StatusCode);
    }
}
