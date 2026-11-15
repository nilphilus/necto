namespace Necto;
public enum NectoOperationRole { Search, Read, Create, Update, Delete, Action }
/// <summary>Author-declared purpose, not inferred CRUD semantics or an authorization rule.</summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
public sealed class NectoOperationAttribute(Type entity, NectoOperationRole role) : Attribute
{
    public Type Entity {get;}=entity;
    public NectoOperationRole Role {get;}=role;
    public string? EntityName {get;set;}
    public string? Description {get;set;}
}
public sealed record NectoOperationPurpose(string OperationId,string EntityId,string EntityName,string Role,string? Description);
