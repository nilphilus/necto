using System.Collections.Immutable;
using System.Reflection;
using System.Runtime.Loader;
using Microsoft.AspNetCore.Builder;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Necto;
using Necto.Generator;
public sealed class AssemblyIsolationTests
{
    private static CSharpCompilation Compile(string name,string source,params MetadataReference[] additional)
    {
        var paths=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Concat(Directory.GetFiles(Path.GetDirectoryName(typeof(WebApplication).Assembly.Location)!,"*.dll"))
            .Append(typeof(EndpointMapping).Assembly.Location).Distinct();
        return CSharpCompilation.Create(name,[CSharpSyntaxTree.ParseText(source,new CSharpParseOptions(LanguageVersion.Latest))],
            paths.Select(path=>MetadataReference.CreateFromFile(path)).Concat(additional),new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary,generalDiagnosticOption:ReportDiagnostic.Error));
    }
    private static (CSharpCompilation Output,GeneratorDriverRunResult Result) Generate(CSharpCompilation compilation)
    {
        var generators=typeof(EndpointMappingGenerator).Assembly.GetTypes().Where(type=>typeof(IIncrementalGenerator).IsAssignableFrom(type)&&type.GetCustomAttribute<GeneratorAttribute>() is not null).Select(type=>(IIncrementalGenerator)Activator.CreateInstance(type)!).ToArray();
        GeneratorDriver driver=CSharpGeneratorDriver.Create(generators.Select(item=>item.AsSourceGenerator()),parseOptions:(CSharpParseOptions)compilation.SyntaxTrees.First().Options);
        driver=driver.RunGeneratorsAndUpdateCompilation(compilation,out var output,out var diagnostics);
        Assert.Empty(diagnostics.Where(item=>item.Severity==DiagnosticSeverity.Error));
        Assert.Empty(output.GetDiagnostics().Where(item=>item.Severity==DiagnosticSeverity.Error));
        return ((CSharpCompilation)output,driver.GetRunResult());
    }
    private static byte[] Emit(CSharpCompilation compilation)
    {
        using var image=new MemoryStream();var result=compilation.Emit(image);
        Assert.True(result.Success,string.Join("\n",result.Diagnostics));return image.ToArray();
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ReferencedFriendAssemblyCannotCollideWithLocalGeneratedApis(bool dependencyHasEndpoints)
    {
        var library=Generate(Compile("Shared.Contracts","""
            using Microsoft.AspNetCore.Builder;
            [assembly:System.Runtime.CompilerServices.InternalsVisibleTo("Consumer.Api")]
            public static class LibrarySetup {
                public static void Map(WebApplication app) {
            """+(dependencyHasEndpoints?"app.MapGet(\"/shared\",()=>42).WithName(\"Shared\");":"")+"} }"));
        var reference=MetadataReference.CreateFromImage(Emit(library.Output));
        var optionalCalls=string.Join(" ",new[]{("ResponseWrapperGenerator","AddNectoGeneratedWrappers"),("FieldConstraintsGenerator","AddNectoGeneratedConstraints"),("AccessHintsGenerator","AddNectoGeneratedAccessHints"),("SensitiveFieldsGenerator","AddNectoGeneratedSensitiveFields")}.Where(item=>typeof(EndpointMappingGenerator).Assembly.GetType("Necto.Generator."+item.Item1) is not null).Select(item=>"options."+item.Item2+"();"));
        var host=Generate(Compile("Consumer.Api",("""
            using Microsoft.AspNetCore.Builder;
            using Necto;
            public static class HostSetup {
                public static void Map(WebApplication app) {
                    app.MapGet("/host",()=>42).WithName("Host");
                    app.MapNectoEndpointMappings().WithMetadata(new object());
                    app.MapNectoEntityCatalog();
                    app.MapNectoOperationRoles();
                    app.UseNectoUI();
                }
                public static void Configure(Microsoft.AspNetCore.OpenApi.OpenApiOptions options) {
                    options.AddNectoGeneratedLinks();
                    options.AddNectoGeneratedDocumentation();
                    OPTIONAL_GENERATED_CALLS
                }
            }
            """).Replace("OPTIONAL_GENERATED_CALLS",optionalCalls),reference));
        Emit(host.Output);
        var before=library.Result.GeneratedTrees.First(tree=>tree.FilePath.EndsWith("EndpointMappings.g.cs")).ToString();
        var after=host.Result.GeneratedTrees.First(tree=>tree.FilePath.EndsWith("EndpointMappings.g.cs")).ToString();
        Assert.NotEqual(before.Split("namespace ")[1].Split(';')[0],after.Split("namespace ")[1].Split(';')[0]);
        Assert.Contains("GeneratedEndpointMappings.MapNectoEndpointMappings(endpoints)",after);
    }
    [Fact] public void AssemblyProviderRemainsDiscoverableByTheRuntimeBaseAttribute()
    {
        var generated=Generate(Compile("Isolated.Runtime."+Guid.NewGuid().ToString("N"),"public static class Marker {}"));
        using var image=new MemoryStream(Emit(generated.Output));
        var assembly=AssemblyLoadContext.Default.LoadFromStream(image);
        Assert.NotNull(assembly.GetCustomAttribute<NectoMappingsAttribute>());
    }
    [Fact] public void IsolationIsDeterministicForTheSameAssembly()
    {
        var first=Generate(Compile("Stable.Api","public static class Marker {}"));
        var second=Generate(Compile("Stable.Api","public static class Marker {}"));
        Assert.Equal(first.Result.GeneratedTrees.Select(tree=>tree.ToString()),second.Result.GeneratedTrees.Select(tree=>tree.ToString()));
    }
}
