extern alias BillingSample;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using BillingSample::SampleApi.FastEndpoints;

public sealed class TenantBillingTests(WebApplicationFactory<TenantRequest> app)
    : IClassFixture<WebApplicationFactory<TenantRequest>>
{
    [Fact]
    public async Task OpenApiRequiresTenantAndMappingsResolve()
    {
        using var client = app.CreateClient();
        var document = (await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json"))!;
        var schemas = document["components"]!["schemas"]!.AsObject();
        Assert.Contains(schemas, schema => (string?)schema.Value?["x-necto-clr-name"]
            == nameof(BillingSample::SampleApi.FastEndpoints.Invoices.Invoice));
        var operations = document["paths"]!.AsObject().SelectMany(path => path.Value!.AsObject())
            .ToDictionary(entry => (string?)entry.Value!["operationId"] ?? "", entry => entry.Value!);
        Assert.NotEmpty(operations);
        Assert.Contains(schemas, schema => (string?)schema.Value?["x-necto-clr-full-name"]
            == typeof(BillingSample::SampleApi.FastEndpoints.Invoices.Invoice).FullName);

        var lineRequest = operations["CreateInvoiceLine"]["requestBody"]!["content"]!["application/json"]!["schema"]!;
        if ((string?)lineRequest["$ref"] is { } requestRef)
            lineRequest = schemas[requestRef.Split('/').Last()]!;
        Assert.Equal(nameof(BillingSample::SampleApi.FastEndpoints.Invoices.CreateInvoiceLineRequest),
            (string?)lineRequest["x-necto-clr-name"]);
        foreach (var operation in operations.Values)
        {
            Assert.Contains(operation["parameters"]!.AsArray(), parameter =>
                (string?)parameter!["name"] == "X-Tenant" && (string?)parameter["in"] == "header"
                && (bool?)parameter["required"] == true);
        }

        var mappings = (await client.GetFromJsonAsync<JsonArray>("/necto/endpoint-mappings"))!;
        Assert.Contains(mappings, mapping =>
            (string?)mapping!["source"]!["operationId"] == "ListInvoices" &&
            (bool?)mapping["source"]!["eachItem"] == true &&
            (string?)mapping["source"]!["property"] == "id" &&
            (string?)mapping["target"]!["operationId"] == "GetInvoice" &&
            (string?)mapping["target"]!["location"] == "path" &&
            (string?)mapping["target"]!["name"] == "invoiceId");
        Assert.Contains(mappings, mapping =>
            (string?)mapping!["source"]!["operationId"] == "GetInvoice" &&
            (string?)mapping["source"]!["objectPath"]?[0] == "lines" &&
            (string?)mapping["source"]!["property"] == "assetId" &&
            (string?)mapping["target"]!["operationId"] == "CreateInvoiceLine" &&
            (string?)mapping["target"]!["location"] == "body" &&
            (string?)mapping["target"]!["name"] == "assetId");
        Assert.Contains(mappings, mapping =>
            (string?)mapping!["source"]!["operationId"] == "ListAssets" &&
            (string?)mapping["source"]!["property"] == "id" &&
            (string?)mapping["target"]!["operationId"] == "CreateInvoice" &&
            (string?)mapping["target"]!["location"] == "body" &&
            (string?)mapping["target"]!["name"] == "assetId" &&
            mapping["target"]!["objectPath"] is JsonArray path && path.Count == 2 &&
            (string?)path[0] == "lines" && path[1] is null);
        Assert.NotEmpty(mappings);
        foreach (var mapping in mappings)
        {
            Assert.Contains((string?)mapping!["source"]!["operationId"], operations.Keys);
            var target = mapping["target"]!;
            var operation = operations[(string)target["operationId"]!];
            if ((string?)target["location"] == "body")
                continue;

            Assert.Contains(operation["parameters"]!.AsArray(), parameter =>
                (string?)parameter!["name"] == (string?)target["name"] &&
                (string?)parameter["in"] == (string?)target["location"]);
        }

        var catalog = (await client.GetFromJsonAsync<JsonArray>("/necto/entity-catalog"))!;
        Assert.NotEmpty(catalog);
        Assert.All(catalog.SelectMany(entry => entry!["uses"]!.AsArray()),
            use => Assert.Contains((string?)use!["operationId"], operations.Keys));
    }

    [Fact]
    public async Task BuildingHistoryReplaysForBothTenants()
    {
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/buildings")).StatusCode);
        using var unknown = TenantClient("unknown");
        Assert.Equal(HttpStatusCode.NotFound, (await unknown.GetAsync("/buildings")).StatusCode);

        using var acme = TenantClient("acme");
        using var northstar = TenantClient("northstar");
        await VerifyHistory(acme, "Browarna 12", "Vistula Property", 375m);
        await VerifyHistory(northstar, "Portowa 8", "Baltic Estates", 490m);
        Assert.Equal(HttpStatusCode.NotFound, (await northstar.GetAsync("/invoices/502")).StatusCode);

        var previous = (await acme.GetFromJsonAsync<JsonArray>("/invoices?buildingId=101&customerId=8"))!;
        Assert.Equal(502, (int)Assert.Single(previous)!["id"]!);
    }

    [Fact]
    public async Task DraftAcceptsOneLinePerAssetInItsOwnBuildingAndTenant()
    {
        using var acme = TenantClient("acme");
        using var northstar = TenantClient("northstar");
        var create = await acme.PostAsJsonAsync("/invoices", new
        {
            buildingId = 101, currency = "PLN",
            lines = new[] { new { assetId = 11, description = "Lift inspection", quantity = 2, unitPrice = 150 } }
        });

        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var path = new Uri(acme.BaseAddress!, create.Headers.Location!).PathAndQuery;
        Assert.Equal(HttpStatusCode.NotFound, (await northstar.GetAsync(path)).StatusCode);

        async Task<HttpStatusCode> AddLine(HttpClient client, int assetId, int quantity = 1, string? invoice = null) =>
            (await client.PostAsJsonAsync((invoice ?? path) + "/lines",
                new { assetId, description = "Ventilation service", quantity, unitPrice = 75 })).StatusCode;

        Assert.Equal(HttpStatusCode.NotFound, await AddLine(northstar, 12));
        Assert.Equal(HttpStatusCode.BadRequest, await AddLine(acme, 199));
        Assert.Equal(HttpStatusCode.BadRequest, await AddLine(acme, 299));
        Assert.Equal(HttpStatusCode.BadRequest, await AddLine(acme, 12, quantity: 0));
        Assert.Equal(HttpStatusCode.Created, await AddLine(acme, 12));
        Assert.Equal(HttpStatusCode.Conflict, await AddLine(acme, 12));
        Assert.Equal(HttpStatusCode.Conflict, await AddLine(acme, 13, invoice: "/invoices/501"));

        var draft = (await acme.GetFromJsonAsync<JsonObject>(path))!;
        Assert.Equal(375m, (decimal)draft["total"]!);
        Assert.Equal(2, draft["lines"]!.AsArray().Count);
    }

    private HttpClient TenantClient(string tenant)
    {
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant", tenant);
        return client;
    }

    private static async Task VerifyHistory(HttpClient client, string name, string owner, decimal total)
    {
        var buildings = (await client.GetFromJsonAsync<JsonArray>("/buildings"))!;
        var building = buildings[0]!;
        Assert.Equal(name, (string?)building["name"]);
        Assert.Equal(owner, (string?)building["owner"]!["name"]);
        var invoices = (await client.GetFromJsonAsync<JsonArray>($"/invoices?buildingId={building["id"]}"))!;
        var invoice = (await client.GetFromJsonAsync<JsonObject>($"/invoices/{invoices[0]!["id"]}"))!;
        Assert.Equal(owner, (string?)invoice["customer"]!["name"]);
        Assert.Equal(total, (decimal)invoice["total"]!);
        var lines = invoice["lines"]!.AsArray();
        Assert.Equal(2, lines.Count);
        var asset = (await client.GetFromJsonAsync<JsonObject>($"/assets/{lines[0]!["assetId"]}"))!;
        Assert.Equal((string?)lines[0]!["assetName"], (string?)asset["name"]);
    }
}
