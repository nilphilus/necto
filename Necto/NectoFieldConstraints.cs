using System.Globalization;
using System.Reflection;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
namespace Necto;
public sealed record NectoFieldConstraint(string ClrName,string Property,string Kind,string? Value,string? Other);
public static class NectoFieldConstraints
{
    public static OpenApiOptions Add(OpenApiOptions options,IReadOnlyList<NectoFieldConstraint> constraints)
    {
        var registry=constraints.GroupBy(item=>item.ClrName).ToDictionary(group=>group.Key,group=>group.ToArray());
        options.AddSchemaTransformer((schema,context,_)=>{
            var type=context.JsonTypeInfo.Type;
            var key=(type.IsGenericType?type.GetGenericTypeDefinition():type).FullName?.Replace('+','.');
            if(key is not null && registry.TryGetValue(key,out var entries))Apply(schema,context.JsonTypeInfo,entries);
            return Task.CompletedTask;
        });return options;
    }
    public static void Apply(OpenApiSchema schema,JsonTypeInfo type,IReadOnlyList<NectoFieldConstraint> entries)
    {
        foreach(var entry in entries)
        {
            var property=type.Properties.FirstOrDefault(item=>item.AttributeProvider is PropertyInfo member && member.Name==entry.Property);
            if(property is null || property.CustomConverter is not null || schema.Properties?.TryGetValue(property.Name,out var raw)!=true || raw is not OpenApiSchema field)continue;
            int? Number(string? value)=>int.TryParse(value,NumberStyles.Integer,CultureInfo.InvariantCulture,out var number)&&number>=0?number:null;
            switch(entry.Kind)
            {
                case "RequiredAttribute": (schema.Required??=new HashSet<string>()).Add(property.Name);break;
                case "StringLengthAttribute":field.MaxLength??=Number(entry.Value);field.MinLength??=Number(entry.Other);break;
                case "MinLengthAttribute":if(field.Type?.HasFlag(JsonSchemaType.Array)==true)field.MinItems??=Number(entry.Value);else field.MinLength??=Number(entry.Value);break;
                case "MaxLengthAttribute":if(field.Type?.HasFlag(JsonSchemaType.Array)==true)field.MaxItems??=Number(entry.Value);else field.MaxLength??=Number(entry.Value);break;
                case "RangeAttribute":
                    if(decimal.TryParse(entry.Value,NumberStyles.Float,CultureInfo.InvariantCulture,out _))field.Minimum??=entry.Value;
                    if(decimal.TryParse(entry.Other,NumberStyles.Float,CultureInfo.InvariantCulture,out _))field.Maximum??=entry.Other;
                    break;
                case "EmailAddressAttribute":field.Format??="email";break;
                case "UrlAttribute":field.Format??="uri";break;
                case "RegularExpressionAttribute":field.Pattern??=entry.Value;break;
            }
        }
    }
}
