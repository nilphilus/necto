using Microsoft.AspNetCore.Builder;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
internal static class ContractGeneratorFixture
{
    internal static GeneratorDriverRunResult Generate(IIncrementalGenerator generator, string body, string? library = null)
    {
        var paths=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Concat(Directory.GetFiles(Path.GetDirectoryName(typeof(WebApplication).Assembly.Location)!,"*.dll"))
            .Append(typeof(Necto.EndpointMapping).Assembly.Location).Distinct();
        var options=new CSharpParseOptions(LanguageVersion.Latest);
        var source="using System; using Necto; using Microsoft.AspNetCore.Builder; using Microsoft.AspNetCore.Http; var app=WebApplication.CreateBuilder().Build(); " + body;
        var references=paths.Select(path=>MetadataReference.CreateFromFile(path)).ToList();
        if(library is not null)
        {
            using var image=new MemoryStream();
            var dependency=CSharpCompilation.Create("SharedContracts",[CSharpSyntaxTree.ParseText(library,options)],references,new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
            var emitted=dependency.Emit(image);Assert.True(emitted.Success,string.Join("\n",emitted.Diagnostics));
            references.Add(MetadataReference.CreateFromImage(image.ToArray()));
        }
        var compilation=CSharpCompilation.Create("ContractFixture",[CSharpSyntaxTree.ParseText(source,options)],references,new CSharpCompilationOptions(OutputKind.ConsoleApplication));
        GeneratorDriver driver=CSharpGeneratorDriver.Create([generator.AsSourceGenerator()],parseOptions:options);
        driver=driver.RunGeneratorsAndUpdateCompilation(compilation,out var output,out var diagnostics);
        Assert.Empty(diagnostics.Where(item=>item.Severity==DiagnosticSeverity.Error));
        Assert.Empty(output.GetDiagnostics().Where(item=>item.Severity==DiagnosticSeverity.Error));
        return driver.GetRunResult();
    }
}
