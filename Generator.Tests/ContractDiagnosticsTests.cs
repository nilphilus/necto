using Necto.Generator;
public sealed class ContractDiagnosticsTests
{
    [Fact] public void ConflictingIdentifierKeysAreReportedAtBothRegistrations()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/one",()=>new Input(42)).WithName("One");
            app.MapGet("/two",([Microsoft.AspNetCore.Mvc.FromQuery,EndpointValue("invoice")] string reference)=>reference).WithName("Two");
            record Input([property:EndpointValue("invoice")] int Id);
            """);
        Assert.Equal(2,result.Diagnostics.Count(item=>item.Id=="NECTO005"));Assert.All(result.Diagnostics.Where(item=>item.Id=="NECTO005"),item=>Assert.True(item.Location.IsInSource));
    }
    [Fact] public void KnownMultiCollectionWrappersAreInformational()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/page",()=>new PagedResult<int>([1],[2])).WithName("Page");
            record PagedResult<T>(T[] Items,T[] Other);
            """);
        Assert.Contains(result.Diagnostics,item=>item.Id=="NECTO006"&&item.Severity==Microsoft.CodeAnalysis.DiagnosticSeverity.Info);
    }
    [Fact] public void InvalidExplicitWrappersAreReportedWithoutBreakingGeneration()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            [NectoResponseCollection("Missing")] record Wrapper(int Id);
            namespace Necto { [AttributeUsage(AttributeTargets.Class)] public sealed class NectoResponseCollectionAttribute(string member):Attribute; }
            """);
        Assert.Contains(result.Diagnostics,item=>item.Id=="NECTO007");
    }
    [Fact] public void CompatibleKeysDoNotProduceNoise()
    {
        var result=ContractGeneratorFixture.Generate(new EndpointMappingGenerator(),"""
            app.MapGet("/one",()=>new Input(42)).WithName("One");
            app.MapGet("/two",([Microsoft.AspNetCore.Mvc.FromQuery,EndpointValue("invoice")] int reference)=>reference).WithName("Two");
            record Input([property:EndpointValue("invoice")] int Id);
            """);
        Assert.DoesNotContain(result.Diagnostics,item=>item.Id=="NECTO005");
    }
}
