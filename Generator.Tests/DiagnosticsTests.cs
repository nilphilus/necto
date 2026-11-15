using Microsoft.AspNetCore.Builder;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Necto.Generator;
public sealed class DiagnosticsTests
{
    private static GeneratorDriverRunResult Generate(string body)
    {
        var source="using System; using Microsoft.AspNetCore.Builder; using Microsoft.AspNetCore.Http; var app=WebApplication.CreateBuilder().Build(); "+body;
        var paths=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Concat(Directory.GetFiles(Path.GetDirectoryName(typeof(WebApplication).Assembly.Location)!,"*.dll")).Distinct();
        var compilation=CSharpCompilation.Create("Fixture",[CSharpSyntaxTree.ParseText(source,new CSharpParseOptions(LanguageVersion.Latest))],paths.Select(path=>MetadataReference.CreateFromFile(path)),new CSharpCompilationOptions(OutputKind.ConsoleApplication));
        Assert.Empty(compilation.GetDiagnostics().Where(item=>item.Severity==DiagnosticSeverity.Error));
        GeneratorDriver driver=CSharpGeneratorDriver.Create(new EndpointMappingGenerator().AsSourceGenerator());
        return driver.RunGenerators(compilation).GetRunResult();
    }
    [Theory]
    [InlineData("app.MapGet(\"/x\",()=>42);",true)]
    [InlineData("app.MapGet(\"/x\",()=>42).WithName(Environment.UserName);",true)]
    [InlineData("app.MapGet(\"/x\",()=>42).WithName(\"X\");",false)]
    public void ReportsUnusableNamesAtTheRegistration(string code,bool expected)=>Assert.Equal(expected,Generate(code).Diagnostics.Any(item=>item.Id=="NECTO001"));
    [Fact]
    public void DuplicatesAreReportedAndExcludedFromGeneratedMappingTable()
    {
        var result=Generate("app.MapGet(\"/a\",()=>new Invoice(1)).WithName(\"Same\"); app.MapGet(\"/b/{invoiceId}\",(int invoiceId)=>new Invoice(invoiceId)).WithName(\"Same\"); record Invoice(int Id);");
        Assert.Equal(2,result.Diagnostics.Count(item=>item.Id=="NECTO002"));Assert.DoesNotContain("new(new ResponseValue",result.GeneratedTrees.Single().ToString());
        Assert.All(result.Diagnostics.Where(item=>item.Id=="NECTO002"),item=>Assert.True(item.Location.IsInSource));
    }
    [Fact]
    public void AmbiguousFieldsAreReportedWithoutInventingBusinessConfidence()
    {
        var result=Generate("app.MapGet(\"/a\",()=>new Invoice(1,2)).WithName(\"List\"); app.MapGet(\"/b/{invoiceId}\",(int invoiceId)=>invoiceId).WithName(\"Detail\"); record Invoice(int Id,int InvoiceId);");
        Assert.Contains(result.Diagnostics,item=>item.Id=="NECTO003");
    }
    [Fact]
    public void OpaqueIResultIsInformationalAndDoesNotCrashGeneration()
    {
        var result=Generate("app.MapGet(\"/a\",(Func<IResult>)(()=>Results.Ok(42))).WithName(\"Opaque\");");
        Assert.Contains(result.Diagnostics,item=>item.Id=="NECTO004"&&item.Severity==DiagnosticSeverity.Info);
        Assert.DoesNotContain(result.Diagnostics,item=>item.Severity==DiagnosticSeverity.Error);
    }
}
