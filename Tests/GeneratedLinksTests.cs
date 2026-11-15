using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.OpenApi;
using Necto;
public sealed class GeneratedLinksTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public GeneratedLinksTests(WebApplicationFactory<Program> factory) => client=factory.CreateClient();
    [Fact]
    public async Task GeneratorPublishesRepresentableLinksAndOmitsArraySelectors()
    {
        var doc=(await client.GetFromJsonAsync<JsonObject>("/openapi/v1.json"))!;
        var operations=doc["paths"]!.AsObject().SelectMany(path=>path.Value!.AsObject()).Select(item=>item.Value).OfType<JsonObject>().ToArray();
        Assert.Contains(operations,operation=>operation["responses"]?.AsObject().Any(response=>response.Value?["links"]?.AsObject().Count>0)==true);
        var list=operations.Single(operation=>operation["operationId"]?.GetValue<string>()=="Invoices");
        Assert.DoesNotContain(list["responses"]!.AsObject(),response=>response.Value?["links"]?.AsObject().Any(link=>link.Value?["operationId"]?.GetValue<string>()=="InvoiceLines")==true);
    }
    [Fact]
    public void AuthorLinksArePreservedAndAmbiguousSourcesAreNotPromoted()
    {
        var response=new OpenApiResponse { Content=new Dictionary<string,OpenApiMediaType>{{"application/json",new(){Schema=new OpenApiSchema{Type=JsonSchemaType.Object,Properties=new Dictionary<string,IOpenApiSchema>{{"id",new OpenApiSchema{Type=JsonSchemaType.Integer}}}}}}},Links=new Dictionary<string,IOpenApiLink>{{"authored",new OpenApiLink{OperationId="Target",Description="Author instruction"}}}};
        var source=new OpenApiOperation{OperationId="Source",Responses=new OpenApiResponses{{"200",response}}};
        var target=new OpenApiOperation{OperationId="Target",Parameters=[new OpenApiParameter{Name="id",In=ParameterLocation.Path}]};
        var doc=new OpenApiDocument{Paths=new OpenApiPaths{{"/source",new OpenApiPathItem{Operations=new Dictionary<HttpMethod,OpenApiOperation>{{HttpMethod.Get,source}}}},{"/target/{id}",new OpenApiPathItem{Operations=new Dictionary<HttpMethod,OpenApiOperation>{{HttpMethod.Get,target}}}}}};
        EndpointMapping mapping=new(new("Source",false,"id"),new("Target","path","id"),"name",null);
        NectoOpenApiLinks.Apply(doc,[mapping]);Assert.Single(response.Links);Assert.Equal("Author instruction",response.Links["authored"].Description);
        response.Links.Clear();NectoOpenApiLinks.Apply(doc,[mapping,mapping with{Source=new("Source",false,"otherId")}]);Assert.Empty(response.Links);
        NectoOpenApiLinks.Apply(doc,[mapping]);NectoOpenApiLinks.Apply(doc,[mapping]);Assert.Single(response.Links);
        Assert.Equal("$response.body#/id",response.Links.Values.Single().Parameters!["path.id"].Expression!.Expression);
    }
}
