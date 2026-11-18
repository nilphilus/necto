using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace Necto.Generator;

internal sealed record MinimalApiRegistration(string? Id, Location Location, IMethodSymbol? Handler)
{
    private const string RouteExtensions = "Microsoft.AspNetCore.Builder.EndpointRouteBuilderExtensions";
    private const string ConventionExtensions = "Microsoft.AspNetCore.Builder.RoutingEndpointConventionBuilderExtensions";

    private static bool IsRoute(IInvocationOperation operation) =>
        operation.TargetMethod.ContainingType.ToDisplayString() == RouteExtensions;

    private static bool IsName(IInvocationOperation operation) =>
        operation.TargetMethod.Name == "WithName" &&
        operation.TargetMethod.ContainingType.ToDisplayString() == ConventionExtensions;

    private static string? ConstantName(IInvocationOperation operation) =>
        operation.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == "endpointName")
            ?.Value.ConstantValue is { HasValue: true, Value: string name } ? name : null;

    internal static MinimalApiRegistration? FromName(
        GeneratorSyntaxContext context, CancellationToken token, bool mappedMethodsOnly = true)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        var model = context.SemanticModel;
        if (model.GetOperation(invocation, token) is not IInvocationOperation name ||
            !IsName(name) || ConstantName(name) is not { } id)
            return null;

        var receiver = ((MemberAccessExpressionSyntax)invocation.Expression).Expression;
        while (receiver is InvocationExpressionSyntax call && call.Expression is MemberAccessExpressionSyntax member)
        {
            if (model.GetOperation(call, token) is IInvocationOperation route && IsRoute(route) &&
                (!mappedMethodsOnly || route.TargetMethod.Name is "MapGet" or "MapPost" or "MapPut" or "MapPatch" or "MapDelete" or "MapMethods"))
                return new(id, invocation.GetLocation(), HandlerOf(route));

            receiver = member.Expression;
        }

        return null;
    }

    internal static MinimalApiRegistration? FromRoute(GeneratorSyntaxContext context, CancellationToken token)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        var model = context.SemanticModel;
        if (model.GetOperation(invocation, token) is not IInvocationOperation route || !IsRoute(route))
            return null;

        string? id = null;
        var current = invocation;
        while (current.Parent is MemberAccessExpressionSyntax member && member.Expression == current &&
               member.Parent is InvocationExpressionSyntax next)
        {
            if (model.GetOperation(next, token) is IInvocationOperation name && IsName(name))
            {
                id = ConstantName(name);
                break;
            }
            current = next;
        }

        return new(string.IsNullOrWhiteSpace(id) ? null : id, invocation.GetLocation(), HandlerOf(route));
    }

    private static IMethodSymbol? HandlerOf(IInvocationOperation route)
    {
        var value = route.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == "handler")?.Value;
        while (value is IConversionOperation conversion)
            value = conversion.Operand;

        return value is IDelegateCreationOperation handler ? handler.Target switch
        {
            IAnonymousFunctionOperation lambda => lambda.Symbol,
            IMethodReferenceOperation reference => reference.Method,
            _ => null
        } : null;
    }
}
