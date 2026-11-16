using System.Reflection;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
namespace Necto;
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
public sealed class NectoResponseCollectionAttribute(string property) : Attribute
{
    public string Property { get; } = property;
    public string? TotalCountProperty { get; set; }
}
public sealed record NectoResponseWrapper(string ClrName, string CollectionProperty, string? TotalCountProperty);
public static class NectoResponseWrappers
{
    public static OpenApiOptions Add(OpenApiOptions options, IReadOnlyList<NectoResponseWrapper> wrappers)
    {
        var registry = wrappers.ToDictionary(item=>item.ClrName);
        options.AddSchemaTransformer((schema,context,_)=> {
            var type=context.JsonTypeInfo.Type;
            var key=(type.IsGenericType?type.GetGenericTypeDefinition():type).FullName?.Replace('+','.');
            if(key is null || !registry.TryGetValue(key,out var wrapper))return Task.CompletedTask;
            string? Wire(string? member) => context.JsonTypeInfo.Properties.FirstOrDefault(property=>property.AttributeProvider is PropertyInfo info && info.Name==member)?.Name;
            var collection=Wire(wrapper.CollectionProperty);
            if(collection is null || schema.Properties?.TryGetValue(collection,out var field)!=true || field?.Items is null)return Task.CompletedTask;
            schema.Extensions ??= new Dictionary<string,IOpenApiExtension>();
            schema.Extensions.TryAdd("x-necto-collection",new JsonNodeExtension(JsonValue.Create(collection)!));
            var count=Wire(wrapper.TotalCountProperty);
            if(count is not null && schema.Properties.ContainsKey(count))schema.Extensions.TryAdd("x-necto-total-count",new JsonNodeExtension(JsonValue.Create(count)!));
            return Task.CompletedTask;
        });return options;
    }
}
