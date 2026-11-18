using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
namespace Necto.Generator;

public sealed partial class EndpointMappingGenerator
{
    private static readonly DiagnosticDescriptor IncompatibleKey = new("NECTO005", "Logical identifier types disagree", "Logical key '{0}' uses incompatible CLR types; align the types or use separate EndpointValue keys", "Necto", DiagnosticSeverity.Warning, true);
    private static readonly DiagnosticDescriptor UnclearWrapper = new("NECTO006", "Response collection is ambiguous", "Wrapper '{0}' has {1} JSON-visible collections; declare the intended collection explicitly or provide manual mappings", "Necto", DiagnosticSeverity.Info, true);
    private static readonly DiagnosticDescriptor InvalidDeclaration = new("NECTO007", "Necto declaration cannot be used", "Necto declaration cannot be used: {0}", "Necto", DiagnosticSeverity.Warning, true);
    private static void RegisterContractDiagnostics(IncrementalGeneratorInitializationContext context)
    {
        var routes = context.SyntaxProvider.CreateSyntaxProvider(static (node, _) => node is InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax { Name.Identifier.ValueText: "WithName" } },
            static (ctx, ct) =>
            {
                var registration = MinimalApiRegistration.FromName(ctx, ct);
                return registration is { Id: { } id, Handler: { } handler }
                    ? new ContractRegistration(CreateEndpoint(id, handler), registration.Location, handler)
                    : null;
            }).Where(static item => item is not null);
        context.RegisterSourceOutput(routes.Collect(), static (ctx, items) =>
        {
            var entries = items.OfType<ContractRegistration>().GroupBy(item => item.Endpoint.Id).Where(group => group.Count() == 1).Select(group => group.Single()).ToArray();
            var keyed = entries.SelectMany(item => item.Endpoint.Response.Concat(item.Endpoint.Request).Where(field => !string.IsNullOrWhiteSpace(field.Key)).Select(field => (Registration: item, Field: field))).GroupBy(item => item.Field.Key!);
            foreach (var group in keyed)
            {
                if (group.Select(item => (ISymbol)item.Field.Type).Distinct(SymbolEqualityComparer.Default).Count() < 2) continue;
                foreach (var entry in group.GroupBy(item => item.Registration).Select(group => group.First())) ctx.ReportDiagnostic(Diagnostic.Create(IncompatibleKey, entry.Registration.Location, group.Key));
            }
            foreach (var item in entries)
            {
                if (item.Handler is null) continue;
                var type = UnwrapSuccess(Unwrap(item.Handler.ReturnType, "System.Threading.Tasks.Task<TResult>", "System.Threading.Tasks.ValueTask<TResult>"));
                if (type is not INamedTypeSymbol named || named.Name is not ("PagedResult" or "PagedResponse" or "PageResult") || Attribute(type, "Necto.NectoResponseCollectionAttribute") is not null) continue;
                var count = ContractSymbols.Properties(named).Count(property => property.Type is IArrayTypeSymbol || EnumerableItem(property.Type) is not null);
                if (count != 1) ctx.ReportDiagnostic(Diagnostic.Create(UnclearWrapper, item.Location, named.Name, count));
            }
        });
        var types = context.SyntaxProvider.CreateSyntaxProvider(static (node, _) => node is TypeDeclarationSyntax, static (ctx, ct) => ctx.SemanticModel.GetDeclaredSymbol((TypeDeclarationSyntax)ctx.Node, ct) as INamedTypeSymbol).Where(static type => type is not null);
        context.RegisterSourceOutput(types.Collect(), static (ctx, items) =>
        {
            foreach (var type in items.OfType<INamedTypeSymbol>().GroupBy(type => type.ToDisplayString()).Select(group => group.First()))
            {
                if (Attribute(type, "Necto.NectoResponseCollectionAttribute") is { } wrapper)
                {
                    var name = wrapper.ConstructorArguments.FirstOrDefault().Value as string;
                    var property = ContractSymbols.Properties(type).FirstOrDefault(property => property.Name == name);
                    if (property is null || Attribute(property, "System.Text.Json.Serialization.JsonConverterAttribute") is not null || !(property.Type is IArrayTypeSymbol || EnumerableItem(property.Type) is not null)) Report(ctx, wrapper, type, "the collection member is missing, ignored, converted or not enumerable");
                }
                foreach (var property in type.GetMembers().OfType<IPropertySymbol>())
                {
                    if (Attribute(property, "Necto.NectoRelationAttribute") is not { } relation) continue;
                    var target = relation.ConstructorArguments.FirstOrDefault().Value as INamedTypeSymbol;
                    var name = relation.ConstructorArguments.Length > 1 ? relation.ConstructorArguments[1].Value as string : "Id";
                    var member = target is null ? null : JsonProperties(target).FirstOrDefault(item => item.Name == name);
                    var sourceIsJsonVisible = JsonProperties(type).Contains(property, SymbolEqualityComparer.Default);
                    if (!sourceIsJsonVisible || member is null)
                    {
                        Report(ctx, relation, property, "relation members must be JSON-visible and have compatible CLR types");
                        continue;
                    }

                    const string converterAttribute = "System.Text.Json.Serialization.JsonConverterAttribute";
                    var usesCustomSerialization = Attribute(property, converterAttribute) is not null ||
                                                  Attribute(member, converterAttribute) is not null;
                    var typesMatch = SymbolEqualityComparer.Default.Equals(NonNullable(property.Type), NonNullable(member.Type));
                    if (usesCustomSerialization || !typesMatch)
                        Report(ctx, relation, property, "relation members must be JSON-visible and have compatible CLR types");
                }
            }
        });
    }
    private static void Report(SourceProductionContext context, AttributeData attribute, ISymbol symbol, string message) =>
        context.ReportDiagnostic(Diagnostic.Create(InvalidDeclaration, attribute.ApplicationSyntaxReference?.GetSyntax().GetLocation() ?? symbol.Locations.FirstOrDefault(), message));
    private sealed record ContractRegistration(Endpoint Endpoint, Location Location, IMethodSymbol? Handler);
}
