using Microsoft.AspNetCore.Builder;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
internal static class ContractGeneratorFixture
{
    internal static GeneratorDriverRunResult Generate(IIncrementalGenerator generator, string body)
    {
        var paths=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Concat(Directory.GetFiles(Path.GetDirectoryName(typeof(WebApplication).Assembly.Location)!,"*.dll"))
            .Append(typeof(Necto.EndpointMapping).Assembly.Location).Distinct();
        var options=new CSharpParseOptions(LanguageVersion.Latest);
        var source="using System; using Necto; using Microsoft.AspNetCore.Builder; using Microsoft.AspNetCore.Http; var app=WebApplication.CreateBuilder().Build(); " + body;
        var compilation=CSharpCompilation.Create("ContractFixture",[CSharpSyntaxTree.ParseText(source,options)],paths.Select(path=>MetadataReference.CreateFromFile(path)),new CSharpCompilationOptions(OutputKind.ConsoleApplication));
        GeneratorDriver driver=CSharpGeneratorDriver.Create([generator.AsSourceGenerator()],parseOptions:options);
        driver=driver.RunGeneratorsAndUpdateCompilation(compilation,out var output,out var diagnostics);
        Assert.Empty(diagnostics.Where(item=>item.Severity==DiagnosticSeverity.Error));
        Assert.Empty(output.GetDiagnostics().Where(item=>item.Severity==DiagnosticSeverity.Error));
        return driver.GetRunResult();
    }
}
