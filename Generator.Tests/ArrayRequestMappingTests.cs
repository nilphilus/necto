using Necto.Generator;

public sealed class ArrayRequestMappingTests
{
    [Fact]
    public void EmitsDestinationPathForArrayItemProperty()
    {
        var result = ContractGeneratorFixture.Generate(new EndpointMappingGenerator(), """
            app.MapGet("/assets", () => new[] { new Asset(42) }).WithName("ListAssets");
            app.MapPost("/invoices", ([Microsoft.AspNetCore.Mvc.FromBody] Invoice request) => request).WithName("CreateInvoice");
            record Asset(int Id);
            record Invoice(Line[] Lines);
            record Line(int AssetId);
            """);

        var mappings = result.GeneratedTrees.Single(tree => tree.FilePath.EndsWith("EndpointMappings.g.cs")).ToString();
        Assert.Contains("""new("CreateInvoice", "body", "assetId") { ObjectPath = new string?[] { "lines", null } }""", mappings);
    }
}
