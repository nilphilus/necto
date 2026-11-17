# Ambiguous generated OpenAPI documentation helpers

Names such as `DocumentationCommentIdHelper`, `CreateDocumentationId` and `OpenApiXmlCommentSupport.generated.cs` belong to the **Microsoft.AspNetCore.OpenApi XML-comment generator**. They are not emitted by Necto's XML documentation generator. A symbol name alone does not prove the cause of a consumer's error.

## Confirmed reproduction

With .NET 10 and Microsoft.AspNetCore.OpenApi 10.0.12, these settings reproduce duplicate generated-source compilation on the **second** build, even without Necto:

```xml
<EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
<CompilerGeneratedFilesOutputPath>Generated</CompilerGeneratedFilesOutputPath>
```

The SDK's default `Compile` glob picks up the `.cs` files written below the project directory by the first build. Roslyn then adds freshly generated equivalents as well. The reproduction reports CS0433 duplicate XML-comment types. Other duplicate-generator cases may report CS0121/CS0111/CS0101 or duplicate interceptor diagnostics; this reproduction does not establish that every ambiguous-call error has that cause.

Necto now packages `buildTransitive/Necto.OpenApi.targets` to exclude the persisted **Necto.Generator** and **Microsoft.AspNetCore.OpenApi.SourceGenerators** subtrees from compilation under the configured output directory. Live generators still execute, XML documentation stays enabled, and emitted files remain available for inspection. Removal compares full normalized paths so relative and absolute paths both work. The target does not remove unrelated user `.cs` files or suppress compiler diagnostics.

This protection applies through the NuGet package. A direct source `ProjectReference` does not automatically import NuGet build targets. It also cannot infer an old output directory after its configuration has changed, fix two explicitly registered analyzer versions, or remove manually copied files outside the configured generator subtrees.

## Workaround for existing releases

Keep emitted inspection files under the intermediate directory, which the SDK already excludes from source globs:

```xml
<PropertyGroup>
  <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
  <CompilerGeneratedFilesOutputPath>$(BaseIntermediateOutputPath)generated</CompilerGeneratedFilesOutputPath>
</PropertyGroup>
```

If inspection is unnecessary, remove the custom settings. In either case, previously emitted files in the old source directory must also be removed from `Compile` or moved out of the source tree. Do not delete handwritten files in that directory. `dotnet clean` alone does not necessarily remove a custom `Generated` folder.

For a dedicated generated-only folder, an explicit exclusion is another option:

```xml
<ItemGroup>
  <Compile Remove="Generated/**/*.cs" />
</ItemGroup>
```

Adapt the folder name to the actual output location. Do not edit `.generated.cs` manually or disable the XML documentation feature as a fix.

If the problem persists with a clean input list, inspect the full error and analyzer list for duplicate registrations/versions of `Microsoft.AspNetCore.OpenApi.SourceGenerators`, and confirm all projects use compatible package/SDK versions. This can be investigated using diagnostics without sharing application source code. Do not disable unrelated analyzers to hide the error.

## Regression test

Pack a local test build, then run the integration script with .NET 10 on PATH:

```sh
dotnet pack Necto/Necto.csproj -c Release -o /tmp/necto-pack
python3 tools/test-emitted-generator-sources.py --package /tmp/necto-pack/Necto.OpenApi.0.3.0.nupkg
```

The script verifies package contents, reproduces the unprotected second-build failure, then compiles a real package consumer with both generators using relative/absolute paths containing spaces. It covers repeated builds, rebuild, disabling file emission while persisted files remain, and retention/compilation of handwritten code inside the output tree. Nothing is published.
