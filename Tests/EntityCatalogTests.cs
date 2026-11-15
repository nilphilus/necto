using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;
public sealed class EntityCatalogTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public EntityCatalogTests(WebApplicationFactory<Program> factory) => client=factory.CreateClient();
    [Fact]
    public async Task CatalogIncludesNestedPathsAndBothSidesOfIdentifiers()
    {
        var catalog=(await client.GetFromJsonAsync<EntityCatalogEntry[]>("/necto/entity-catalog"))!;
        Assert.Equal(catalog.Length,catalog.Select(item=>item.Id).Distinct().Count());
        Assert.Contains(catalog,item=>item.Kind=="model" && item.Name.EndsWith("Invoice"));
        var invoiceId=Assert.Single(catalog,item=>item.Kind=="identifier"&&item.Name=="InvoiceId");
        Assert.Contains(invoiceId.Uses,use=>use.Direction=="response");
        Assert.Contains(invoiceId.Uses,use=>use.Direction=="request");
        Assert.Contains(catalog.SelectMany(item=>item.Uses),use=>use.Path.Contains("invoice-lines")&&use.Path.Contains(null));
        var config=await client.GetFromJsonAsync<Dictionary<string,string>>("/necto/configuration");
        Assert.Equal("/necto/entity-catalog",config!["entityCatalogUrl"]);
    }
}
