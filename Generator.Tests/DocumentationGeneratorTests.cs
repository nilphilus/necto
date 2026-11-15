using Microsoft.AspNetCore.Builder;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Necto.Generator;
public sealed class DocumentationGeneratorTests
{
    private static GeneratorDriverRunResult Generate(string source)
    {
        var options=new CSharpParseOptions(LanguageVersion.Latest,DocumentationMode.None);
        var paths=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Concat(Directory.GetFiles(Path.GetDirectoryName(typeof(WebApplication).Assembly.Location)!,"*.dll")).Distinct();
        var compilation=CSharpCompilation.Create("DocumentationFixture",[CSharpSyntaxTree.ParseText("using System.Collections.Generic; using Microsoft.AspNetCore.Builder; var app=WebApplication.CreateBuilder().Build(); "+source,options)],paths.Select(path=>MetadataReference.CreateFromFile(path)),new CSharpCompilationOptions(OutputKind.ConsoleApplication));
        Assert.Empty(compilation.GetDiagnostics().Where(item=>item.Severity==DiagnosticSeverity.Error));
        GeneratorDriver driver=CSharpGeneratorDriver.Create([new XmlDocumentationGenerator().AsSourceGenerator()],parseOptions:options);
        var result=driver.RunGenerators(compilation).GetRunResult();Assert.Empty(result.Diagnostics.Where(item=>item.Severity==DiagnosticSeverity.Error));return result;
    }
    [Fact]
    public void SourceCommentsWorkWithDocumentationModeNoneAndExpandingGenericsTerminate()
    {
        var result=Generate("""
            app.MapGet("/a", Handler.Read).WithName("Read");
            public static class Handler {
                /// <summary>Read one invoice.</summary>
                public static Recursive<string> Read()=>new();
            }
            /// <summary>Invoice data from source.</summary>
            public sealed class Recursive<T> {
                /// <summary>The next invoice.</summary>
                public Recursive<List<T>> Next {get;set;}
            }
            """);
        var text=result.GeneratedTrees.Single().ToString();Assert.Contains("Read one invoice.",text);Assert.Contains("Invoice data from source.",text);Assert.Contains("The next invoice.",text);Assert.True(text.Length<100000);
    }
    [Fact]
    public void MalformedXmlIsIgnoredWithoutBreakingTheBuild()
    {
        var result=Generate("""
            app.MapGet("/a",()=>new Item()).WithName("Read");
            /// <summary>Unclosed
            public sealed class Item {public int Id {get;set;}}
            """);
        Assert.DoesNotContain("Unclosed",result.GeneratedTrees.Single().ToString());
    }
}
