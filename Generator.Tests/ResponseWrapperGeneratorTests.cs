using Necto.Generator;
public sealed class ResponseWrapperGeneratorTests
{
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
