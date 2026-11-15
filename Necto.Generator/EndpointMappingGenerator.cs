using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace Necto.Generator;

[Generator]
public sealed partial class EndpointMappingGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        RegisterDiagnostics(context);
        var endpoints = context.SyntaxProvider.CreateSyntaxProvider(
            static (node, _) => node is InvocationExpressionSyntax
            {
                Expression: MemberAccessExpressionSyntax { Name.Identifier.ValueText: "WithName" }
            },
            static (context, cancellationToken) => ReadEndpoint(context, cancellationToken))
            .Where(static endpoint => endpoint is not null);

        context.RegisterSourceOutput(endpoints.Collect(), static (context, endpoints) =>
            Emit(context, endpoints.OfType<Endpoint>()));
    }

    private static Endpoint? ReadEndpoint(GeneratorSyntaxContext context, CancellationToken cancellationToken)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        var model = context.SemanticModel;
        if (model.GetOperation(invocation, cancellationToken) is not IInvocationOperation withName
            || withName.TargetMethod.ContainingType.ToDisplayString() != "Microsoft.AspNetCore.Builder.RoutingEndpointConventionBuilderExtensions"
            || withName.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == "endpointName")?.Value
                .ConstantValue is not { HasValue: true, Value: string operationId })
            return null;

        // Follow the receiver of the fluent registration back to MapGet, MapPost, etc.
        ExpressionSyntax receiver = ((MemberAccessExpressionSyntax)invocation.Expression).Expression;
        while (receiver is InvocationExpressionSyntax call && call.Expression is MemberAccessExpressionSyntax member)
        {
            if (model.GetOperation(call, cancellationToken) is IInvocationOperation route
                && route.TargetMethod.ContainingType.ToDisplayString() == "Microsoft.AspNetCore.Builder.EndpointRouteBuilderExtensions"
                && route.TargetMethod.Name is "MapGet" or "MapPost" or "MapPut" or "MapPatch" or "MapDelete" or "MapMethods")
            {
                var handlerValue = route.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == "handler")?.Value;
                while (handlerValue is IConversionOperation conversion)
                    handlerValue = conversion.Operand;
                if (handlerValue is IDelegateCreationOperation handler)
                {
                    var method = handler.Target switch
                    {
                        IAnonymousFunctionOperation lambda => lambda.Symbol,
                        IMethodReferenceOperation reference => reference.Method,
                        _ => null
                    };
                    if (method is not null)
                        return new Endpoint(operationId, ReadResponse(method).ToArray(),
                            method.Parameters.SelectMany(ReadRequest).ToArray());
                }
                return null;
            }
            receiver = member.Expression;
        }
        return null;
    }

    private static IEnumerable<Field> ReadResponse(IMethodSymbol handler)
    {
        var type = Unwrap(handler.ReturnType, "System.Threading.Tasks.Task<TResult>", "System.Threading.Tasks.ValueTask<TResult>");
        if (type is INamedTypeSymbol results && results.ContainingNamespace.ToDisplayString() == "Microsoft.AspNetCore.Http.HttpResults"
            && results.Name == "Results" && results.IsGenericType)
        {
            return results.TypeArguments
                .Where(result => !SymbolEqualityComparer.Default.Equals(result, UnwrapSuccess(result)))
                .SelectMany(ReadResponseFields)
                .Distinct();
        }
        return ReadResponseFields(type);
    }

    private static ITypeSymbol UnwrapSuccess(ITypeSymbol type) =>
        Unwrap(type, "Microsoft.AspNetCore.Http.HttpResults.Ok<TValue>", "Microsoft.AspNetCore.Http.HttpResults.Created<TValue>");

    private static IEnumerable<Field> ReadResponseFields(ITypeSymbol type)
    {
        type = UnwrapSuccess(type);

        var itemType = type is IArrayTypeSymbol { Rank: 1 } array ? array.ElementType : EnumerableItem(type);
        type = NonNullable(itemType ?? type);
        var eachItem = itemType is not null;

        if (IsTypedId(type))
        {
            yield return new Field(type, null, null, null, "", eachItem);
            yield break;
        }

        foreach (var field in ReadObjectFields(type, eachItem ? new string?[] { null } : Array.Empty<string?>(),
                     new HashSet<ITypeSymbol>(SymbolEqualityComparer.Default), eachItem))
            yield return field;
    }

    private static IEnumerable<Field> ReadObjectFields(ITypeSymbol type, string?[] path,
        HashSet<ITypeSymbol> ancestors, bool eachItem)
    {
        // Recursive DTOs cannot be expanded into a finite set of wire paths.
        if (path.Length > 16 || !ancestors.Add(type))
            yield break;
        foreach (var property in JsonProperties(type))
        {
            var name = property.Name.Equals("Id", StringComparison.OrdinalIgnoreCase)
                ? type.Name + "Id" : property.Name;
            var propertyType = NonNullable(property.Type);
            yield return new Field(propertyType, JsonName(property), name,
                ValueKey(property), "", eachItem, path.Length > (eachItem ? 1 : 0) ? path : null,
                type.Name + property.Name, type.ToDisplayString());
            if (IsTypedId(propertyType))
                continue;
            var item = propertyType is IArrayTypeSymbol { Rank: 1 } array
                ? array.ElementType : EnumerableItem(propertyType);
            var childPath = path.Concat(new string?[] { JsonName(property) });
            if (item is not null)
                childPath = childPath.Concat(new string?[] { null });
            foreach (var field in ReadObjectFields(NonNullable(item ?? propertyType), childPath.ToArray(), ancestors, eachItem))
                yield return field;
        }
        ancestors.Remove(type);
    }

    private static IEnumerable<Field> ReadRequest(IParameterSymbol parameter)
    {
        var type = NonNullable(parameter.Type);
        if (Attribute(parameter, "Microsoft.AspNetCore.Mvc.FromBodyAttribute") is not null)
        {
            if (IsTypedId(type) || IsScalar(type) || ValueKey(parameter) is not null)
            {
                yield return new Field(type, null, parameter.Name, ValueKey(parameter), "body");
                yield break;
            }
            foreach (var property in JsonProperties(type))
                yield return new Field(NonNullable(property.Type), JsonName(property), property.Name,
                    ValueKey(property), "body", Owner: type.ToDisplayString());
            yield break;
        }

        if (parameter.GetAttributes().Any(attribute => attribute.AttributeClass?.AllInterfaces.Any(
                contract => contract.ToDisplayString() is "Microsoft.AspNetCore.Http.Metadata.IFromServiceMetadata"
                    or "Microsoft.AspNetCore.Http.Metadata.IFromFormMetadata") == true)
            || Attribute(parameter, "Microsoft.AspNetCore.Http.AsParametersAttribute") is not null)
            yield break;

        var binding = parameter.GetAttributes().FirstOrDefault(attribute =>
            attribute.AttributeClass?.ToDisplayString() is "Microsoft.AspNetCore.Mvc.FromQueryAttribute"
                or "Microsoft.AspNetCore.Mvc.FromRouteAttribute" or "Microsoft.AspNetCore.Mvc.FromHeaderAttribute");
        var location = binding?.AttributeClass?.Name switch
        {
            "FromQueryAttribute" => "query",
            "FromRouteAttribute" => "path",
            "FromHeaderAttribute" => "header",
            _ => "parameter"
        };
        if (!IsScalar(type) && !(IsTypedId(type) && type.GetMembers("TryParse").OfType<IMethodSymbol>()
                .Any(method => method.IsStatic && method.DeclaredAccessibility == Accessibility.Public)))
            yield break;

        var name = binding?.NamedArguments.FirstOrDefault(pair => pair.Key == "Name").Value.Value as string
            ?? parameter.Name;
        yield return new Field(type, name, IdentifierName(name) ?? IdentifierName(parameter.Name) ?? name,
            ValueKey(parameter), location);
    }

    private static IEnumerable<IPropertySymbol> JsonProperties(ITypeSymbol type)
    {
        if (type.TypeKind is not (TypeKind.Class or TypeKind.Struct or TypeKind.Interface)
            || IsScalar(type) || Attribute(type, "System.Text.Json.Serialization.JsonConverterAttribute") is not null)
            yield break;

        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var current = type; current is not null; current = current.BaseType)
        {
            foreach (var property in current.GetMembers().OfType<IPropertySymbol>())
            {
                if (property.IsStatic || property.IsIndexer || property.GetMethod?.DeclaredAccessibility != Accessibility.Public
                    || !seen.Add(property.Name)
                    || Attribute(property, "System.Text.Json.Serialization.JsonExtensionDataAttribute") is not null
                    || Attribute(property, "Necto.NectoSensitiveAttribute") is not null)
                    continue;

                var ignore = Attribute(property, "System.Text.Json.Serialization.JsonIgnoreAttribute");
                if (ignore is null || ignore.NamedArguments.Any(pair => pair.Key == "Condition" && pair.Value.Value is int value && value != 1))
                    yield return property;
            }
        }
    }

    private static ITypeSymbol Unwrap(ITypeSymbol type, params string[] wrappers) =>
        type is INamedTypeSymbol { TypeArguments.Length: 1 } named
        && wrappers.Contains(named.OriginalDefinition.ToDisplayString()) ? named.TypeArguments[0] : type;

    private static ITypeSymbol? EnumerableItem(ITypeSymbol type)
    {
        const string enumerable = "System.Collections.Generic.IEnumerable<T>";
        if (IsScalar(type))
            return null;
        var contracts = type.AllInterfaces.AsEnumerable();
        if (type is INamedTypeSymbol named)
            contracts = contracts.Prepend(named);
        var items = contracts.Where(contract => contract.OriginalDefinition.ToDisplayString() == enumerable)
            .Select(contract => contract.TypeArguments[0]).Distinct<ITypeSymbol>(SymbolEqualityComparer.Default).Take(2).ToArray();
        // Dictionaries have a JSON object shape.
        return items.Length == 1 && !type.AllInterfaces.Any(contract =>
            contract.OriginalDefinition.ToDisplayString() is "System.Collections.Generic.IDictionary<TKey, TValue>"
                or "System.Collections.Generic.IReadOnlyDictionary<TKey, TValue>") ? items[0] : null;
    }

    private static ITypeSymbol NonNullable(ITypeSymbol type) =>
        type is INamedTypeSymbol named && named.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T
            ? named.TypeArguments[0] : type;

    private static bool IsScalar(ITypeSymbol type) =>
        type.SpecialType is SpecialType.System_String or SpecialType.System_Byte or SpecialType.System_SByte
            or SpecialType.System_Int16 or SpecialType.System_UInt16 or SpecialType.System_Int32 or SpecialType.System_UInt32
            or SpecialType.System_Int64 or SpecialType.System_UInt64 || type.ToDisplayString() == "System.Guid";

    private static bool IsTypedId(ITypeSymbol type) =>
        type is INamedTypeSymbol { Arity: 0, TypeKind: TypeKind.Class or TypeKind.Struct }
        && IdentifierName(type.Name) is not null;

    private static string? IdentifierName(string name) =>
        name.Length > 2 && (name.EndsWith("Id", StringComparison.Ordinal) || name.EndsWith("ID", StringComparison.Ordinal))
            ? name : null;

    private static AttributeData? Attribute(ISymbol symbol, string name) =>
        symbol.GetAttributes().FirstOrDefault(attribute => attribute.AttributeClass?.ToDisplayString() == name);

    private static string? AttributeString(ISymbol symbol, string name) =>
        Attribute(symbol, name)?.ConstructorArguments.FirstOrDefault().Value as string;

    private static string? ValueKey(ISymbol symbol)
    {
        var key = AttributeString(symbol, "Necto.EndpointValueAttribute");
        return string.IsNullOrWhiteSpace(key) ? null : key;
    }

    private static string JsonName(IPropertySymbol property)
    {
        var explicitName = AttributeString(property, "System.Text.Json.Serialization.JsonPropertyNameAttribute");
        if (explicitName is not null)
            return explicitName;
        var chars = property.Name.ToCharArray();
        for (var index = 0; index < chars.Length && char.IsUpper(chars[index]); index++)
        {
            if (index > 0 && index + 1 < chars.Length && !char.IsUpper(chars[index + 1]))
            {
                if (chars[index + 1] == ' ')
                    chars[index] = char.ToLowerInvariant(chars[index]);
                break;
            }
            chars[index] = char.ToLowerInvariant(chars[index]);
        }
        return new string(chars);
    }

    private static string? Match(Field source, Field target)
    {
        if (!SymbolEqualityComparer.Default.Equals(source.Type, target.Type))
            return null;
        if (source.Key is not null || target.Key is not null)
            return string.Equals(source.Key ?? source.ConventionName, target.Key ?? target.ConventionName,
                StringComparison.OrdinalIgnoreCase) && !ContainsSensitiveValue(source.Type) ? "attribute" : null;
        if (IsTypedId(source.Type))
            return ContainsSensitiveValue(source.Type) ? null : "type";
        return IsScalar(source.Type)
            && (SameName(source.ConventionName, target.ConventionName)
                || SameName(source.ConventionName, target.WireName)
                || SameName(source.QualifiedName, target.ConventionName)
                || SameName(source.QualifiedName, target.WireName)
                || (!SameName(source.WireName, "Id") && SameName(source.WireName, target.WireName)))
            ? "name" : null;
    }

    private static bool ContainsSensitiveValue(ITypeSymbol root)
    {
        var pending=new Stack<ITypeSymbol>();pending.Push(root);
        var seen=new HashSet<ITypeSymbol>(SymbolEqualityComparer.Default);
        while(pending.Count>0)
        {
            var type=NonNullable(pending.Pop());if(IsScalar(type)||!seen.Add(type))continue;
            if(seen.Count>512)return true;
            if(type is IArrayTypeSymbol array){pending.Push(array.ElementType);continue;}
            if(EnumerableItem(type) is { } item){pending.Push(item);continue;}
            for(var current=type as INamedTypeSymbol;current is not null;current=current.BaseType)
            foreach(var property in current.GetMembers().OfType<IPropertySymbol>())
            {
                if(property.IsStatic||property.IsIndexer||property.GetMethod?.DeclaredAccessibility!=Accessibility.Public)continue;
                var ignore=Attribute(property,"System.Text.Json.Serialization.JsonIgnoreAttribute");
                if(ignore is not null && !ignore.NamedArguments.Any(pair=>pair.Key=="Condition"&&pair.Value.Value is int value&&value!=1))continue;
                if(Attribute(property,"Necto.NectoSensitiveAttribute") is not null)return true;
                pending.Push(property.Type);
            }
        }
        return false;
    }

    private static bool SameName(string? source, string? target) =>
        source is not null && string.Equals(source, target, StringComparison.OrdinalIgnoreCase);

    private static void Emit(SourceProductionContext context, IEnumerable<Endpoint> endpoints)
    {
        var ordered = endpoints.GroupBy(endpoint => endpoint.Id, StringComparer.Ordinal)
            .Where(group => group.Count() == 1).Select(group => group.Single())
            .OrderBy(endpoint => endpoint.Id, StringComparer.Ordinal).ToArray();
        var code = new StringBuilder("""
            // <auto-generated/>
            #nullable enable
            using Microsoft.AspNetCore.Builder;
            using Microsoft.AspNetCore.Http;
            using Microsoft.AspNetCore.Routing;

            [assembly: Necto.GeneratedNectoMappings]

            namespace Necto;

            internal sealed class GeneratedNectoMappingsAttribute : NectoMappingsAttribute
            {
                public override void Map(IEndpointRouteBuilder endpoints) => endpoints.MapNectoEndpointMappings();
            }

            internal static class GeneratedEndpointMappings
            {
                private static readonly EndpointMapping[] Mappings =
                {

            """);
        foreach (var producer in ordered)
        foreach (var source in producer.Response)
        foreach (var consumer in ordered)
        foreach (var target in consumer.Request)
        {
            if (producer == consumer || Match(source, target) is not { } match)
                continue;
            var suggestion = IsScalar(source.Type)
                ? IdentifierName(source.ConventionName ?? "") ?? IdentifierName(target.ConventionName ?? "")
                : null;
            var objectPath = source.ObjectPath is null ? "" : " { ObjectPath = new string?[] { "
                + string.Join(", ", source.ObjectPath.Select(Literal)) + " } }";
            code.AppendLine($"        new(new ResponseValue({Literal(producer.Id)}, {(source.EachItem ? "true" : "false")}, {Literal(source.WireName)}){objectPath}, "
                + $"new({Literal(consumer.Id)}, {Literal(target.Location)}, {Literal(target.WireName)}), {Literal(match)}, {Literal(suggestion)}) {{ Evidence = new({Literal(source.Type.ToDisplayString())}, {Literal(target.Type.ToDisplayString())}, {Literal(source.ConventionName)}, {Literal(target.ConventionName)}, {Literal(source.Key ?? target.Key)}) }},");
        }
        code.AppendLine("""
                };

                internal static Microsoft.AspNetCore.OpenApi.OpenApiOptions AddNectoGeneratedLinks(this Microsoft.AspNetCore.OpenApi.OpenApiOptions options) =>
                    NectoOpenApiLinks.AddNectoLinks(options, Mappings);

                internal static RouteHandlerBuilder MapNectoEndpointMappings(
                    this IEndpointRouteBuilder endpoints, string pattern = "/necto/endpoint-mappings") =>
                    EndpointMappingsMetadata.Map(endpoints, pattern, Mappings);
            }
            """);
        EmitEntityCatalog(context, ordered);
        context.AddSource("EndpointMappings.g.cs", code.ToString());
    }

    private static string Literal(string? value) => value is null ? "null" : SymbolDisplay.FormatLiteral(value, quote: true);

    private sealed record Endpoint(string Id, Field[] Response, Field[] Request);
    private sealed record Field(
        ITypeSymbol Type, string? WireName, string? ConventionName, string? Key, string Location,
        bool EachItem = false, string?[]? ObjectPath = null, string? QualifiedName = null, string? Owner = null);
}
