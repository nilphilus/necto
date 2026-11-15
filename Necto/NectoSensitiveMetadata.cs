using System.Reflection;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
namespace Necto;
/// <summary>Marks a JSON property for exclusion from default Necto retention/export and generated value mappings. Does not change the API payload.</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class NectoSensitiveAttribute : Attribute;
public sealed record NectoSensitiveField(string ClrName,string Property);
public static class NectoSensitiveMetadata
{
    public static OpenApiOptions Add(OpenApiOptions options,IReadOnlyList<NectoSensitiveField> fields)
    {
        var registry=fields.GroupBy(item=>item.ClrName).ToDictionary(group=>group.Key,group=>group.Select(item=>item.Property).ToHashSet());
        options.AddSchemaTransformer((schema,context,_)=>{
            var type=context.JsonTypeInfo.Type;var key=(type.IsGenericType?type.GetGenericTypeDefinition():type).FullName?.Replace('+','.');
            if(key is null || !registry.TryGetValue(key,out var members))return Task.CompletedTask;
            var names=context.JsonTypeInfo.Properties.Where(property=>property.AttributeProvider is PropertyInfo info&&members.Contains(info.Name)&&schema.Properties?.ContainsKey(property.Name)==true).Select(property=>property.Name).ToHashSet();
            if(names.Count==0)return Task.CompletedTask;
            schema.Extensions??=new Dictionary<string,IOpenApiExtension>();
            if(schema.Extensions.TryGetValue("x-necto-sensitive-properties",out var existing)&&existing is JsonNodeExtension {Node:JsonArray values})
                foreach(var value in values.OfType<JsonValue>())if(value.TryGetValue<string>(out var name))names.Add(name);
            schema.Extensions["x-necto-sensitive-properties"]=new JsonNodeExtension(new JsonArray(names.Order(StringComparer.Ordinal).Select(name=>(JsonNode?)JsonValue.Create(name)).ToArray()));
            return Task.CompletedTask;
        });return options;
    }
}
