using System.Text;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;
namespace Necto.Generator;
[Generator]
public sealed class XmlDocumentationGenerator:IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var endpoints=context.SyntaxProvider.CreateSyntaxProvider(
            static(node,_)=>node is InvocationExpressionSyntax{Expression:MemberAccessExpressionSyntax{Name.Identifier.ValueText:"WithName"}},
            static(ctx,ct)=>Read(ctx,ct)).Where(static item=>item is not null);
        context.RegisterSourceOutput(endpoints.Collect(),static(ctx,items)=>Emit(ctx,items.OfType<DocumentationEndpoint>().ToArray()));
    }
    private static DocumentationEndpoint? Read(GeneratorSyntaxContext context,CancellationToken token)
    {
        var invocation=(InvocationExpressionSyntax)context.Node;var model=context.SemanticModel;
        if(model.GetOperation(invocation,token) is not IInvocationOperation named||named.TargetMethod.ContainingType.ToDisplayString()!="Microsoft.AspNetCore.Builder.RoutingEndpointConventionBuilderExtensions"||named.Arguments.FirstOrDefault(arg=>arg.Parameter?.Name=="endpointName")?.Value.ConstantValue is not{HasValue:true,Value:string id})return null;
        ExpressionSyntax receiver=((MemberAccessExpressionSyntax)invocation.Expression).Expression;
        while(receiver is InvocationExpressionSyntax call&&call.Expression is MemberAccessExpressionSyntax member)
        {
            if(model.GetOperation(call,token) is IInvocationOperation route&&route.TargetMethod.ContainingType.ToDisplayString()=="Microsoft.AspNetCore.Builder.EndpointRouteBuilderExtensions")
            {
                var value=route.Arguments.FirstOrDefault(arg=>arg.Parameter?.Name=="handler")?.Value;
                while(value is IConversionOperation conversion)value=conversion.Operand;
                var handler=value is IDelegateCreationOperation creation?creation.Target switch{IAnonymousFunctionOperation lambda=>lambda.Symbol,IMethodReferenceOperation reference=>reference.Method,_=>null}:null;
                return handler is null?null:new(id,handler);
            }
            receiver=member.Expression;
        }
        return null;
    }
    private static XElement? Xml(ISymbol symbol)
    {
        try {
            var value=symbol.GetDocumentationCommentXml(expandIncludes:true);
            if(!string.IsNullOrWhiteSpace(value))return XElement.Parse(value);
            // SDK projects can disable XML-file generation. Read source trivia as
            // a fallback without requiring a second documentation file.
            var syntax=symbol.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax();
            var trivia=syntax?.GetLeadingTrivia().ToFullString()??"";
            var lines=trivia.Split('\n').Select(line=>line.TrimStart()).Where(line=>line.StartsWith("///",StringComparison.Ordinal)).Select(line=>line.Substring(3));
            var fragment=string.Join("\n",lines);
            return string.IsNullOrWhiteSpace(fragment)?null:XElement.Parse("<member>"+fragment+"</member>");
        }catch(System.Xml.XmlException){return null;}
    }
    private static string? Text(XElement? element)
    {
        if(element is null)return null;
        var copy=new XElement(element);
        foreach(var node in copy.Descendants().Where(node=>node.Name.LocalName is "see" or "paramref" or "typeparamref").ToArray())node.ReplaceWith(node.Attribute("name")?.Value??node.Attribute("cref")?.Value.Split(':').Last()??node.Value);
        foreach(var node in copy.Descendants("c").ToArray())node.ReplaceWith("`"+node.Value+"`");
        foreach(var node in copy.Descendants("code").ToArray())node.ReplaceWith("\n\n```\n"+node.Value.Trim()+"\n```\n\n");
        foreach(var node in copy.Descendants("para").ToArray())node.ReplaceWith("\n\n"+node.Value+"\n\n");
        var result=copy.Value.Trim();return result.Length==0?null:result;
    }
    private static string? Description(XElement? xml)=>string.Join("\n\n",new[]{Text(xml?.Element("summary")),Text(xml?.Element("remarks"))}.Where(value=>value is not null)) is {Length:>0} value?value:null;
    private static string Name(INamedTypeSymbol type)=>type.ContainingType is not null?Name(type.ContainingType)+"+"+type.MetadataName:(type.ContainingNamespace.IsGlobalNamespace?"":type.ContainingNamespace.ToDisplayString()+".")+type.MetadataName;
    private static string Literal(string? value)=>value is null?"null":SymbolDisplay.FormatLiteral(value,true);
    private static void Emit(SourceProductionContext context,DocumentationEndpoint[] endpoints)
    {
        var types=new Dictionary<string,INamedTypeSymbol>(StringComparer.Ordinal);var visited=new HashSet<ITypeSymbol>(SymbolEqualityComparer.Default);
        void Visit(ITypeSymbol type)
        {
            if(!visited.Add(type))return;
            if(type is IArrayTypeSymbol array){Visit(array.ElementType);return;}
            if(type is not INamedTypeSymbol named)return;
            foreach(var argument in named.TypeArguments)Visit(argument);
            if(!named.Locations.Any(location=>location.IsInSource))return;
            types[Name(named.OriginalDefinition)]=named.OriginalDefinition;
            if(named.BaseType is not null)Visit(named.BaseType);
            foreach(var property in named.GetMembers().OfType<IPropertySymbol>().Where(property=>!property.IsStatic&&property.GetMethod?.DeclaredAccessibility==Accessibility.Public))Visit(property.Type);
        }
        foreach(var endpoint in endpoints){Visit(endpoint.Handler.ReturnType);foreach(var parameter in endpoint.Handler.Parameters)Visit(parameter.Type);}
        var code=new StringBuilder("""
            // <auto-generated/>
            #nullable enable
            namespace Necto;
            internal static class GeneratedNectoDocumentation
            {
                internal static Microsoft.AspNetCore.OpenApi.OpenApiOptions AddNectoGeneratedDocumentation(this Microsoft.AspNetCore.OpenApi.OpenApiOptions options) =>
                    NectoDocumentation.AddNectoDocumentation(options, new NectoOperationDocumentation[] {
            """);
        foreach(var endpoint in endpoints.GroupBy(item=>item.Id).Where(group=>group.Count()==1).Select(group=>group.Single()).OrderBy(item=>item.Id,StringComparer.Ordinal))
        {
            var xml=Xml(endpoint.Handler);var parameters=xml?.Elements("param").Where(item=>item.Attribute("name") is not null).ToDictionary(item=>item.Attribute("name")!.Value,Text)??new Dictionary<string,string?>();
            string? body=null;code.AppendLine($"new({Literal(endpoint.Id)}, {Literal(Text(xml?.Element("summary")))}, {Literal(Text(xml?.Element("remarks")))}, new System.Collections.Generic.Dictionary<string,string> {{");
            foreach(var parameter in endpoint.Handler.Parameters)
            {
                if(!parameters.TryGetValue(parameter.Name,out var text)||text is null)continue;
                var attributes=parameter.GetAttributes();
                if(attributes.Any(attribute=>attribute.AttributeClass?.ToDisplayString()=="Microsoft.AspNetCore.Mvc.FromBodyAttribute")){body=text;continue;}
                var binding=attributes.FirstOrDefault(attribute=>attribute.AttributeClass?.ToDisplayString() is "Microsoft.AspNetCore.Mvc.FromQueryAttribute" or "Microsoft.AspNetCore.Mvc.FromRouteAttribute" or "Microsoft.AspNetCore.Mvc.FromHeaderAttribute");
                var name=binding?.NamedArguments.FirstOrDefault(pair=>pair.Key=="Name").Value.Value as string??parameter.Name;
                code.AppendLine($"[{Literal(name)}] = {Literal(text)},");
            }
            code.AppendLine($"}}, {Literal(body)}),");
        }
        code.AppendLine("}, new NectoTypeDocumentation[] {");
        foreach(var pair in types.OrderBy(pair=>pair.Key,StringComparer.Ordinal))
        {
            var type=pair.Value;var xml=Xml(type);code.AppendLine($"new({Literal(pair.Key)}, {Literal(Description(xml))}, new System.Collections.Generic.Dictionary<string,string> {{");
            var seen=new HashSet<string>();
            for(var current=type;current is not null;current=current.BaseType)
                foreach(var property in current.GetMembers().OfType<IPropertySymbol>().Where(property=>!property.IsStatic&&!property.IsIndexer&&property.GetMethod?.DeclaredAccessibility==Accessibility.Public))
                {
                    if(!seen.Add(property.Name))continue;
                    var text=Description(Xml(property))??Text(Xml(current)?.Elements("param").FirstOrDefault(item=>item.Attribute("name")?.Value==property.Name));
                    if(text is not null)code.AppendLine($"[{Literal(property.Name)}] = {Literal(text)},");
                }
            code.AppendLine("}),");
        }
        code.AppendLine("});\n}");context.AddSource("NectoDocumentation.g.cs",code.ToString());
    }
    private sealed record DocumentationEndpoint(string Id,IMethodSymbol Handler);
}
