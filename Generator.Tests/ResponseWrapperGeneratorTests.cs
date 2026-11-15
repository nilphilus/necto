using Necto.Generator;
public sealed class ResponseWrapperGeneratorTests
{
    [Fact] public void ReadsReachableDtosFromAReferencedAssembly()
    {
        var result=ContractGeneratorFixture.Generate(new ResponseWrapperGenerator(), "app.MapGet(\"/shared\",()=>new Shared.PagedResult<int>([1],10)).WithName(\"Shared\");", "namespace Shared { public record PagedResult<T>(T[] Items,int TotalCount); }");
        Assert.Contains("PagedResult`1",result.GeneratedTrees.Single().ToString());
    }
    [Fact] public void RecognizesOneCollectionAndRejectsAmbiguousOrIgnoredFields()
    {
        var result=ContractGeneratorFixture.Generate(new ResponseWrapperGenerator(),"""
            record PagedResult<T>(T[] Items, int TotalCount);
            record PagedResponse<T>(T[] First, T[] Second);
            [NectoResponseCollection(nameof(Data))] record Envelope<T>(T[] Data);
            [NectoResponseCollection(nameof(Hidden))] record HiddenEnvelope([property: System.Text.Json.Serialization.JsonIgnore] int[] Hidden);
            """);
        var text=result.GeneratedTrees.Single().ToString();
        Assert.Contains("PagedResult`1",text);Assert.Contains("Envelope`1",text);
        Assert.DoesNotContain("PagedResponse`1",text);Assert.DoesNotContain("HiddenEnvelope\"",text);
    }
}
