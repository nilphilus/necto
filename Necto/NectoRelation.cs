namespace Necto;
/// <summary>Explicitly connects a JSON property to a compatible JSON-visible property on another model.</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class NectoRelationAttribute(Type targetType,string targetProperty = "Id") : Attribute
{
    public Type TargetType { get; } = targetType;
    public string TargetProperty { get; } = targetProperty;
}
public sealed record EntityCatalogRelation(string TargetId,string Property,string TargetProperty,string Match,string Explanation);
