using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.OpenApi;
using Necto;
public sealed class FieldConstraintTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact] public void FillsMissingConstraintsWithoutOverridingAuthoredValues()
    {
        var info=new JsonSerializerOptions { PropertyNamingPolicy=JsonNamingPolicy.CamelCase,TypeInfoResolver=new DefaultJsonTypeInfoResolver() }.GetTypeInfo(typeof(Input));
        var field=new OpenApiSchema { Type=JsonSchemaType.String,MaxLength=17 };
        var schema=new OpenApiSchema { Properties=new Dictionary<string,IOpenApiSchema>{{"name",field}} };
        NectoFieldConstraints.Apply(schema,info,[new("Input","Name","StringLengthAttribute","32","3"),new("Input","Name","RequiredAttribute",null,null)]);
        Assert.Equal(17,field.MaxLength);Assert.Equal(3,field.MinLength);Assert.Contains("name",schema.Required!);
    }
    [Fact] public async Task GeneratedConstraintsArePublishedOnActualSchemas()
    {
        var doc=await factory.CreateClient().GetFromJsonAsync<JsonObject>("/openapi/v1.json");var schema=doc!["components"]!["schemas"]!["ConstrainedInvoice"]!;
        Assert.Equal(32,schema["properties"]!["reference"]!["maxLength"]!.GetValue<int>());
        Assert.Equal(10000,schema["properties"]!["quantity"]!["maximum"]!.GetValue<int>());
    }
    public sealed record Input(string Name);
}
