using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using System.Security.Cryptography;
using System.Text;
namespace Necto;

public static class NectoOpenApiLinks
{
    /// <summary>Opt-in promotion of representable mappings to standard OpenAPI Links. Author links are never replaced.</summary>
    public static OpenApiOptions AddNectoLinks(this OpenApiOptions options, IReadOnlyList<EndpointMapping> mappings)
    {
        options.AddDocumentTransformer((document, _, _) => { Apply(document, mappings); return Task.CompletedTask; });
        return options;
    }
    internal static void Apply(OpenApiDocument document, IReadOnlyList<EndpointMapping> mappings)
    {
        var operations = document.Paths?.Values.SelectMany(path => path.Operations?.Values.Select(operation => (Path: path, Operation: operation)) ?? [])
            .Where(item => item.Operation.OperationId is not null).GroupBy(item => item.Operation.OperationId!)
            .Where(group => group.Count() == 1).ToDictionary(group => group.Key, group => group.Single()) ?? [];
        foreach (var pair in mappings.Where(mapping => mapping.Source.ApiId is null && mapping.Target.ApiId is null)
                     .GroupBy(mapping => (mapping.Source.OperationId, Target: mapping.Target.OperationId)))
        {
            if (!operations.TryGetValue(pair.Key.OperationId, out var producer) || !operations.TryGetValue(pair.Key.Target, out var consumer)) continue;
            var destinations = pair.GroupBy(mapping => (mapping.Target.Location, mapping.Target.Name)).ToArray();
            // Multiple possible sources for one destination cannot be represented as one deterministic Link.
            if (destinations.Any(group => group.Select(mapping => Pointer(mapping.Source)).Distinct().Count() != 1)) continue;
            foreach (var (status, raw) in producer.Operation.Responses ?? [])
            {
                if (status.Length != 3 || status[0] != '2' || raw is not OpenApiResponse response) continue;
                if (response.Links?.Values.Any(link => link.OperationId == consumer.Operation.OperationId) == true) continue;
                var link = new OpenApiLink { OperationId = consumer.Operation.OperationId,
                    Description = "Generated from Necto mappings. This is a possible next call, not a business prerequisite.", Parameters = new Dictionary<string, RuntimeExpressionAnyWrapper>() };
                var valid = true;
                foreach (var group in destinations)
                {
                    var mapping = group.First(); var pointer = Pointer(mapping.Source);
                    if (pointer is null || !HasResponsePath(document, response, Parts(mapping.Source))) { valid = false; break; }
                    var expression = new RuntimeExpressionAnyWrapper { Expression = RuntimeExpression.Build("$response.body#" + pointer) };
                    if (mapping.Target.Location == "body")
                    {
                        if (mapping.Target.Name is not null || consumer.Operation.RequestBody is null) { valid = false; break; }
                        link.RequestBody = expression;
                    }
                    else
                    {
                        var parameters = (consumer.Path.Parameters ?? []).Concat(consumer.Operation.Parameters ?? [])
                            .Where(parameter => parameter.Name == mapping.Target.Name && (mapping.Target.Location == "parameter" || parameter.In?.ToString().Equals(mapping.Target.Location, StringComparison.OrdinalIgnoreCase) == true))
                            .GroupBy(parameter => (parameter.Name, parameter.In)).Select(group => group.Last()).ToArray();
                        if (parameters.Length != 1 || parameters[0].In is not (ParameterLocation.Path or ParameterLocation.Query or ParameterLocation.Header)) { valid = false; break; }
                        link.Parameters[parameters[0].In!.Value.ToString().ToLowerInvariant() + "." + parameters[0].Name] = expression;
                    }
                }
                if (!valid) continue;
                var key = "necto_" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pair.Key.Target)))[..12].ToLowerInvariant();
                response.Links ??= new Dictionary<string, IOpenApiLink>();
                response.Links.TryAdd(key, link);
            }
        }
    }
    private static string?[] Parts(ResponseValue source) => (source.ObjectPath ?? (source.EachItem ? [null] : []))
        .Concat(source.Property is null ? [] : new string?[] { source.Property }).ToArray();
    private static string? Pointer(ResponseValue source)
    {
        var parts = Parts(source);
        return parts.Any(part => part is null) ? null : string.Concat(parts.Select(part => "/" + part!.Replace("~", "~0").Replace("/", "~1")));
    }
    private static bool HasResponsePath(OpenApiDocument document, OpenApiResponse response, string?[] parts) =>
        response.Content?.Where(item => item.Key.Contains("json", StringComparison.OrdinalIgnoreCase)).Any(item => HasPath(document, item.Value.Schema, parts)) == true;
    private static bool HasPath(OpenApiDocument document, IOpenApiSchema? schema, string?[] parts)
    {
        for (var index = 0; index <= parts.Length; index++)
        {
            var seen = new HashSet<string>();
            while (schema is OpenApiSchemaReference reference)
            {
                var id = reference.Reference.Id;
                if (id is null || !seen.Add(id) || document.Components?.Schemas?.TryGetValue(id, out schema) != true) return false;
            }
            if (schema is null) return false;
            if (index == parts.Length) return true;
            if (parts[index] is not string name || schema.Properties?.TryGetValue(name, out schema) != true) return false;
        }
        return false;
    }
}
