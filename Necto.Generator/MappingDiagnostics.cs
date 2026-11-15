using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;
namespace Necto.Generator;
public sealed partial class EndpointMappingGenerator
{
    private static readonly DiagnosticDescriptor MissingId = new("NECTO001", "Stable operation ID required", "Necto cannot inspect this registration: put WithName with a non-empty compile-time constant in the same fluent chain", "Necto", DiagnosticSeverity.Warning, true);
    private static readonly DiagnosticDescriptor DuplicateId = new("NECTO002", "Duplicate operation ID", "Operation ID '{0}' is declared more than once; Necto excludes these registrations", "Necto", DiagnosticSeverity.Warning, true);
    private static readonly DiagnosticDescriptor AmbiguousSource = new("NECTO003", "Multiple possible response values", "'{0}' supplies multiple values for '{1}' input '{2}'; review the paths or use dedicated identifier types/EndpointValue keys", "Necto", DiagnosticSeverity.Warning, true);
    private static readonly DiagnosticDescriptor UnsupportedHandler = new("NECTO004", "Handler cannot be inspected", "Necto cannot inspect handler '{0}'; use a directly referenced method or lambda with a concrete response type", "Necto", DiagnosticSeverity.Info, true);
    private static void RegisterDiagnostics(IncrementalGeneratorInitializationContext context)
    {
        var registrations=context.SyntaxProvider.CreateSyntaxProvider(
            static (node,_)=>node is InvocationExpressionSyntax {Expression:MemberAccessExpressionSyntax {Name.Identifier.ValueText:"MapGet" or "MapPost" or "MapPut" or "MapPatch" or "MapDelete" or "MapMethods"}},
            static (ctx,ct)=> {
                var route=(InvocationExpressionSyntax)ctx.Node;
                if(ctx.SemanticModel.GetOperation(route,ct) is not IInvocationOperation operation || operation.TargetMethod.ContainingType.ToDisplayString()!="Microsoft.AspNetCore.Builder.EndpointRouteBuilderExtensions")return null;
                var current=route;
                while(current.Parent is MemberAccessExpressionSyntax member && member.Expression==current && member.Parent is InvocationExpressionSyntax next)
                {
                    if(ctx.SemanticModel.GetOperation(next,ct) is IInvocationOperation named && named.TargetMethod.Name=="WithName" && named.TargetMethod.ContainingType.ToDisplayString()=="Microsoft.AspNetCore.Builder.RoutingEndpointConventionBuilderExtensions")
                    {
                        var id=named.Arguments.FirstOrDefault(arg=>arg.Parameter?.Name=="endpointName")?.Value.ConstantValue;
                        return new DiagnosticRegistration(id is {HasValue:true,Value:string text} && !string.IsNullOrWhiteSpace(text) ? text : null,route.GetLocation(),ReadHandler(operation));
                    }
                    current=next;
                }
                return new DiagnosticRegistration(null,route.GetLocation(),ReadHandler(operation));
            }).Where(static item=>item is not null);
        context.RegisterSourceOutput(registrations.Collect(),static (production,items)=> {
            foreach(var item in items.OfType<DiagnosticRegistration>())
            {
                if(item.Id is null)production.ReportDiagnostic(Diagnostic.Create(MissingId,item.Location));
                else if(item.Handler is null)production.ReportDiagnostic(Diagnostic.Create(UnsupportedHandler,item.Location,item.Id));
                else if(Unwrap(item.Handler.ReturnType,"System.Threading.Tasks.Task<TResult>","System.Threading.Tasks.ValueTask<TResult>").ToDisplayString()=="Microsoft.AspNetCore.Http.IResult")
                    production.ReportDiagnostic(Diagnostic.Create(UnsupportedHandler,item.Location,item.Id));
            }
            var named=items.OfType<DiagnosticRegistration>().Where(item=>item.Id is not null).ToArray();
            foreach(var duplicate in named.GroupBy(item=>item.Id).Where(group=>group.Count()>1))
                foreach(var item in duplicate)production.ReportDiagnostic(Diagnostic.Create(DuplicateId,item.Location,item.Id));
            var unique=named.GroupBy(item=>item.Id).Where(group=>group.Count()==1).Select(group=>group.Single()).Where(item=>item.Handler is not null).ToArray();
            foreach(var producer in unique)
            foreach(var consumer in unique)
            {
                if(producer==consumer)continue;
                foreach(var target in consumer.Handler!.Parameters.SelectMany(ReadRequest))
                {
                    var sources=ReadResponse(producer.Handler!).Where(source=>Match(source,target) is not null)
                        .Select(source=>string.Join("/",source.ObjectPath??Array.Empty<string?>())+"|"+source.EachItem+"|"+source.WireName).Distinct().Take(2).Count();
                    if(sources>1)production.ReportDiagnostic(Diagnostic.Create(AmbiguousSource,consumer.Location,producer.Id,consumer.Id,target.WireName??"body"));
                }
            }
        });
    }
    private static IMethodSymbol? ReadHandler(IInvocationOperation route)
    {
        var value=route.Arguments.FirstOrDefault(argument=>argument.Parameter?.Name=="handler")?.Value;
        while(value is IConversionOperation conversion)value=conversion.Operand;
        return value is IDelegateCreationOperation handler ? handler.Target switch {
            IAnonymousFunctionOperation lambda=>lambda.Symbol,
            IMethodReferenceOperation reference=>reference.Method,
            _=>null
        } : null;
    }
    private sealed record DiagnosticRegistration(string? Id, Location Location, IMethodSymbol? Handler);
}
