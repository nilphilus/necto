using Necto.Generator;
public sealed class SensitiveFieldGeneratorTests
{
    [Fact] public void AWholeTypedIdentifierOrExplicitObjectBindingCannotBypassSensitiveMembers()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/id",()=>new SessionId("private")).WithName("Id");
            app.MapGet("/envelope",()=>new Envelope(new SessionId("private"))).WithName("Envelope");
            app.MapPost("/target",([Microsoft.AspNetCore.Mvc.FromBody] SessionId value)=>value).WithName("Target");
            app.MapPost("/keyed",([Microsoft.AspNetCore.Mvc.FromBody,EndpointValue("session")] SessionId value)=>value).WithName("Keyed");
            record SessionId([property:NectoSensitive] string Value);
            record Envelope([property:EndpointValue("session")] SessionId Session);
            """);
        var text=result.GeneratedTrees.Single(tree=>tree.FilePath.EndsWith("EndpointMappings.g.cs")).ToString();Assert.DoesNotContain("new(new ResponseValue",text);
    }
    [Fact] public void ReadsReachableDtosFromAReferencedAssembly()
    {
        var result=ContractGeneratorFixture.Generate(new SensitiveFieldsGenerator(), "app.MapGet(\"/shared\",()=>new Shared.Input(\"x\")).WithName(\"Shared\");", "namespace Shared { public record Input([property:Necto.NectoSensitive] string Code); }");
        Assert.Contains("Code",result.GeneratedTrees.Single().ToString());
    }
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
