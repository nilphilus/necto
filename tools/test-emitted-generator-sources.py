#!/usr/bin/env python3
"""SDK/NuGet integration regression; use a locally packed Necto.OpenApi nupkg.
DOTNET_ROOT/PATH/NUGET_PACKAGES follow the caller's environment. Never publishes.
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True, type=Path)
args = parser.parse_args()
package = args.package.resolve()
with zipfile.ZipFile(package) as archive:
    assert 'buildTransitive/Necto.OpenApi.targets' in archive.namelist()
    assert 'analyzers/dotnet/cs/Necto.Generator.dll' in archive.namelist()
    spec = ET.fromstring(archive.read(next(name for name in archive.namelist() if name.endswith('.nuspec'))))
    version = spec.find('.//{*}version').text

dotnet = shutil.which('dotnet')
assert dotnet, 'Put the .NET 10 SDK on PATH.'

def build(directory, *options, succeeds=True):
    result = subprocess.run([dotnet, 'build', 'Repro.csproj', '-m:1', '/p:UseSharedCompilation=false', *options], cwd=directory,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if succeeds != (result.returncode == 0):
        raise AssertionError(result.stdout)
    return result.stdout

with tempfile.TemporaryDirectory(prefix='necto emitted regression ') as temporary:
    root = Path(temporary)
    def project(directory, emission, with_necto):
        directory.mkdir(parents=True, exist_ok=True)
        generated = Path(emission) if Path(emission).is_absolute() else directory / emission
        (generated / 'UserCode').mkdir(parents=True, exist_ok=True)
        (generated / 'UserCode' / 'Keep.cs').write_text('public static class UserCodeMustRemain { public static int Value => 7; }')
        references = f'<PackageReference Include="Necto.OpenApi" Version="{version}" />' if with_necto else ''
        (directory / 'Repro.csproj').write_text(f'''<Project Sdk="Microsoft.NET.Sdk.Web">
<PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings>
<GenerateDocumentationFile>true</GenerateDocumentationFile><NoWarn>1591</NoWarn>
<EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles><CompilerGeneratedFilesOutputPath>{escape(emission)}</CompilerGeneratedFilesOutputPath></PropertyGroup>
<ItemGroup><PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />{references}</ItemGroup>
</Project>''')
        (directory / 'Program.cs').write_text('''using Microsoft.AspNetCore.Builder;
'''+('using Necto;\n' if with_necto else '')+'''var builder=WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
var app=builder.Build();
app.MapOpenApi();
app.MapGet("/test",()=>UserCodeMustRemain.Value).WithName("Read");
'''+('app.UseNectoUI();\n' if with_necto else '')+'''app.Run();
''')
        (directory / 'NuGet.Config').write_text(f'''<configuration><packageSources><clear/>
<add key="local" value="{escape(str(package.parent))}"/><add key="nuget" value="https://api.nuget.org/v3/index.json"/>
</packageSources></configuration>''')
        return generated

    baseline = root / 'baseline'
    project(baseline, 'Generated', False)
    build(baseline)
    failure = build(baseline, '--no-restore', succeeds=False)
    assert re.search(r'error CS(?:0433|0121|0101|0111|9153)', failure), failure
    print('PASS: reproduced duplicate OpenAPI generated compilation on the second SDK build.')

    for absolute in [False, True]:
        directory = root / ('absolute' if absolute else 'relative')
        emission = str(directory / 'Generated with spaces') if absolute else 'Generated with spaces'
        generated = project(directory, emission, True)
        build(directory)
        assert list((generated / 'Necto.Generator').rglob('*.cs'))
        assert list((generated / 'Microsoft.AspNetCore.OpenApi.SourceGenerators').rglob('*.cs'))
        build(directory, '--no-restore')
        build(directory, '--no-restore', '-t:Rebuild')
        build(directory, '--no-restore', '/p:EmitCompilerGeneratedFiles=false')
        assert (generated / 'UserCode' / 'Keep.cs').exists()
        print(f'PASS: packaged targets; {"absolute" if absolute else "relative"} emitted path; repeat/rebuild/emission disabled; handwritten code retained.')
