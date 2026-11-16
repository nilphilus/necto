using Necto.Generator;
public sealed class FieldConstraintGeneratorTests
{
    [Fact] public void ReadsReachableDtosFromAReferencedAssembly()
    {
        var result=ContractGeneratorFixture.Generate(new FieldConstraintsGenerator(), "app.MapGet(\"/shared\",()=>new Shared.Input(\"x\")).WithName(\"Shared\");", "namespace Shared { public record Input([property:System.ComponentModel.DataAnnotations.StringLength(17)] string Code); }");
        Assert.Contains("StringLengthAttribute",result.GeneratedTrees.Single().ToString());
    }
    [Fact] public void EmitsSupportedAttributesWithClrNamesAndEscapedPatterns()
    {
        var result=ContractGeneratorFixture.Generate(new FieldConstraintsGenerator(),"""
            record Input([property: System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.StringLength(32,MinimumLength=3)] string Name,
                [property: System.ComponentModel.DataAnnotations.Range(1,100)] int Count,
                [property: System.Text.Json.Serialization.JsonIgnore, System.ComponentModel.DataAnnotations.Required] string Hidden);
            """);
        var text=result.GeneratedTrees.Single().ToString();Assert.Contains("StringLengthAttribute",text);Assert.Contains("RangeAttribute",text);Assert.DoesNotContain("\"Hidden\"",text);
    }
}
