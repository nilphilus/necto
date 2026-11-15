using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;
public sealed class EntityRelationTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact] public async Task ExplicitRelationNavigatesToAModelWithItsExistingEndpointUses()
    {
        var entries=(await factory.CreateClient().GetFromJsonAsync<EntityCatalogEntry[]>("/necto/entity-catalog"))!;
        var source=Assert.Single(entries,item=>item.Name=="RelatedInvoice"&&item.Kind=="model");
        var relation=Assert.Single(source.Relations);Assert.Equal("explicit",relation.Match);
        var target=Assert.Single(entries,item=>item.Id==relation.TargetId);Assert.Contains(target.Uses,use=>use.OperationId=="Customers");
        Assert.Equal("customerId",relation.Property);Assert.Equal("id",relation.TargetProperty);
    }
}
