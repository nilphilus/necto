using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;
namespace Necto.Generator;
internal static class ContractSymbols
{
    internal static IncrementalValueProvider<ImmutableArray<INamedTypeSymbol>> Types(IncrementalGeneratorInitializationContext context)
    {
        var declared=context.SyntaxProvider.CreateSyntaxProvider(static(node,_)=>node is TypeDeclarationSyntax,
            static(ctx,ct)=>ctx.SemanticModel.GetDeclaredSymbol((TypeDeclarationSyntax)ctx.Node,ct) as INamedTypeSymbol).Collect();
        var roots=context.SyntaxProvider.CreateSyntaxProvider(static(node,_)=>node is InvocationExpressionSyntax {Expression:MemberAccessExpressionSyntax {Name.Identifier.ValueText:"WithName"}},static(ctx,ct)=>{
            if(ctx.SemanticModel.GetOperation(ctx.Node,ct) is not IInvocationOperation named || named.TargetMethod.ContainingType.ToDisplayString()!="Microsoft.AspNetCore.Builder.RoutingEndpointConventionBuilderExtensions")return Array.Empty<ITypeSymbol>();
            ExpressionSyntax receiver=((MemberAccessExpressionSyntax)((InvocationExpressionSyntax)ctx.Node).Expression).Expression;
            while(receiver is InvocationExpressionSyntax call && call.Expression is MemberAccessExpressionSyntax member)
            {
                if(ctx.SemanticModel.GetOperation(call,ct) is IInvocationOperation route && route.TargetMethod.ContainingType.ToDisplayString()=="Microsoft.AspNetCore.Builder.EndpointRouteBuilderExtensions")
                {
                    var value=route.Arguments.FirstOrDefault(item=>item.Parameter?.Name=="handler")?.Value;
                    while(value is IConversionOperation conversion)value=conversion.Operand;
                    var handler=value is IDelegateCreationOperation creation?creation.Target switch {IAnonymousFunctionOperation lambda=>lambda.Symbol,IMethodReferenceOperation method=>method.Method,_=>null}:null;
                    return handler is null?Array.Empty<ITypeSymbol>():handler.Parameters.Select(parameter=>parameter.Type).Prepend(handler.ReturnType).ToArray();
                }
                receiver=member.Expression;
            }
            return Array.Empty<ITypeSymbol>();
        }).Collect();
        return declared.Combine(roots).Select(static(pair,ct)=>{
            var result=pair.Left.OfType<INamedTypeSymbol>().ToList();
            var seen=new HashSet<ISymbol>(SymbolEqualityComparer.Default);
            var stack=new Stack<(ITypeSymbol Type,int Depth)>(pair.Right.SelectMany(items=>items).Select(type=>(type,0)));
            while(stack.Count>0 && seen.Count<512)
            {
                ct.ThrowIfCancellationRequested();var (type,depth)=stack.Pop();if(depth>32)continue;
                if(type is IArrayTypeSymbol array){stack.Push((array.ElementType,depth+1));continue;}
                if(type is not INamedTypeSymbol named || !seen.Add(named))continue;
                foreach(var argument in named.TypeArguments)stack.Push((argument,depth+1));
                var space=named.ContainingNamespace.ToDisplayString();
                if(space=="System" || space.StartsWith("System.",StringComparison.Ordinal) || space.StartsWith("Microsoft.AspNetCore.",StringComparison.Ordinal))continue;
                result.Add(named.OriginalDefinition);
                foreach(var property in Properties(named))stack.Push((property.Type,depth+1));
            }
            return result.GroupBy(ClrName).Select(group=>group.First()).ToImmutableArray();
        });
    }
    internal static string Literal(string? value) => value is null ? "null" : Microsoft.CodeAnalysis.CSharp.SymbolDisplay.FormatLiteral(value, true);
    internal static AttributeData? Attribute(ISymbol symbol, string name) => symbol.GetAttributes().FirstOrDefault(item => item.AttributeClass?.ToDisplayString() == name);
    internal static string ClrName(INamedTypeSymbol type) => (type.ContainingType is not null ? ClrName(type.ContainingType) + "." : type.ContainingNamespace.IsGlobalNamespace ? "" : type.ContainingNamespace.ToDisplayString() + ".") + type.MetadataName;
    internal static IEnumerable<IPropertySymbol> Properties(INamedTypeSymbol type)
    {
        if (Attribute(type, "System.Text.Json.Serialization.JsonConverterAttribute") is not null) yield break;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var current = type; current is not null; current = current.BaseType)
        foreach (var property in current.GetMembers().OfType<IPropertySymbol>())
        {
            if (!seen.Add(property.Name) || property.IsStatic || property.IsIndexer || property.GetMethod?.DeclaredAccessibility != Accessibility.Public) continue;
            if (Attribute(property,"System.Text.Json.Serialization.JsonExtensionDataAttribute") is not null) continue;
            var ignore = Attribute(property,"System.Text.Json.Serialization.JsonIgnoreAttribute");
            if (ignore is not null && !ignore.NamedArguments.Any(item => item.Key == "Condition" && item.Value.Value is int value && value != 1)) continue;
            yield return property;
        }
    }
    internal static bool Collection(ITypeSymbol type) => type.SpecialType != SpecialType.System_String && (type is IArrayTypeSymbol || type.AllInterfaces.Any(item => item.OriginalDefinition.SpecialType == SpecialType.System_Collections_Generic_IEnumerable_T));
}
