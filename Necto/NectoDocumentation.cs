using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using System.Reflection;
namespace Necto;
public sealed record NectoOperationDocumentation(string OperationId,string? Summary,string? Description,IReadOnlyDictionary<string,string> Parameters,string? BodyDescription);
public sealed record NectoTypeDocumentation(string ClrName,string? Description,IReadOnlyDictionary<string,string> Properties);
public static class NectoDocumentation
{
    /// <summary>Fills absent OpenAPI descriptions using compile-time XML documentation; explicit content wins.</summary>
    public static OpenApiOptions AddNectoDocumentation(this OpenApiOptions options,IReadOnlyList<NectoOperationDocumentation> operations,IReadOnlyList<NectoTypeDocumentation> types)
    {
        var operationDocs=operations.GroupBy(item=>item.OperationId).Where(group=>group.Count()==1).ToDictionary(group=>group.Key,group=>group.Single());
        var typeDocs=types.GroupBy(item=>item.ClrName).Where(group=>group.Count()==1).ToDictionary(group=>group.Key,group=>group.Single());
        options.AddSchemaTransformer((schema,context,_)=>{
            var type=context.JsonTypeInfo.Type;var key=(type.IsGenericType?type.GetGenericTypeDefinition():type).FullName;
            if(key is null||!typeDocs.TryGetValue(key,out var docs))return Task.CompletedTask;
            if(string.IsNullOrWhiteSpace(schema.Description))schema.Description=docs.Description;
            foreach(var property in context.JsonTypeInfo.Properties)
            {
                if(property.AttributeProvider is not PropertyInfo member||!docs.Properties.TryGetValue(member.Name,out var text)||schema.Properties?.TryGetValue(property.Name,out var field)!=true||field is null||!string.IsNullOrWhiteSpace(field.Description))continue;
                if(field is OpenApiSchema concrete)concrete.Description=text;
                else if(field is OpenApiSchemaReference reference)reference.Description=text;
            }
            return Task.CompletedTask;
        });
        options.AddDocumentTransformer((document,_,_)=>{
            foreach(var operation in document.Paths?.Values.SelectMany(path=>path.Operations?.Values.AsEnumerable()??Enumerable.Empty<OpenApiOperation>())??[])
            {
                if(operation.OperationId is null||!operationDocs.TryGetValue(operation.OperationId,out var docs))continue;
                if(string.IsNullOrWhiteSpace(operation.Summary))operation.Summary=docs.Summary;
                if(string.IsNullOrWhiteSpace(operation.Description))operation.Description=docs.Description;
                foreach(var parameter in operation.Parameters??[])
                    if(parameter is OpenApiParameter concrete&&string.IsNullOrWhiteSpace(concrete.Description)&&concrete.Name is not null&&docs.Parameters.TryGetValue(concrete.Name,out var text))concrete.Description=text;
                if(operation.RequestBody is OpenApiRequestBody body&&string.IsNullOrWhiteSpace(body.Description))body.Description=docs.BodyDescription;
            }
            return Task.CompletedTask;
        });
        return options;
    }
}
