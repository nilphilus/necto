using Necto.Generator;
public sealed class EntityRelationGeneratorTests
{
    [Fact] public void SharedTypedIdsExplainRelationsWithoutGuessingPrimitiveForeignKeys()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/customers",()=>new Customer(new CustomerId(1))).WithName("Customers");
            app.MapGet("/invoices",()=>new Invoice(42,new CustomerId(1),9)).WithName("Invoices");
            record CustomerId(int Value); record Customer(CustomerId Id); record Invoice(int Id,CustomerId CustomerId,int UnknownId);
            """);
        var text=result.GeneratedTrees.Single(tree=>tree.FilePath.EndsWith("EntityCatalog.g.cs")).ToString();
        Assert.Contains("shared dedicated identifier type",text);Assert.Contains("new(\"model:Customer\",\"customerId\"",text);
        Assert.DoesNotContain("UnknownId points",text);
    }
}
