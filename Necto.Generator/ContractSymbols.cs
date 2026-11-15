using Microsoft.CodeAnalysis;
namespace Necto.Generator;
internal static class ContractSymbols
{
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
