using Necto.Generator;
public sealed class SensitiveFieldGeneratorTests
{
    [Fact] public void MarksFieldsByDeclarationWithoutReadingRuntimeSecrets()
    {
        var result=ContractGeneratorFixture.Generate(new SensitiveFieldsGenerator(),"""
            record Input([property:NectoSensitive] string Code,string Name,[property:System.Text.Json.Serialization.JsonIgnore,NectoSensitive] string Hidden);
            """);var text=result.GeneratedTrees.Single().ToString();Assert.Contains("\"Code\"",text);Assert.DoesNotContain("\"Hidden\"",text);Assert.DoesNotContain("\"Name\"",text);
    }
    [Fact] public void SensitiveFieldsNeverBecomeGeneratedValueMappings()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/source",()=>new Input("private")).WithName("Source");
            app.MapGet("/target",(string code)=>code).WithName("Target");
            record Input([property:NectoSensitive] string Code);
            """);var text=result.GeneratedTrees.Single(tree=>tree.FilePath.EndsWith("EndpointMappings.g.cs")).ToString();Assert.DoesNotContain("new(new ResponseValue",text);
    }
}
