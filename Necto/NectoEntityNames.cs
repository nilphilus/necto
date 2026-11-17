using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;

namespace Necto;

internal static class NectoEntityNames
{
    private const string ClrNameExtension = "x-necto-clr-name";
    private static readonly ConditionalWeakTable<OpenApiOptions, object> Registrations = new();

    internal static void Register(WebApplication app, string openApiPath)
    {
        var services = app.Services.GetService<IServiceProviderIsKeyedService>();
        var monitor = app.Services.GetService<IOptionsMonitor<OpenApiOptions>>();
        if (services is null || monitor is null)
            return;

        // MapOpenApi uses a named options instance and defaults to "v1".
        var name = Path.GetFileNameWithoutExtension(openApiPath).ToLowerInvariant();
        if (!services.IsKeyedService(typeof(IOpenApiDocumentProvider), name))
            name = "v1";

        if (services.IsKeyedService(typeof(IOpenApiDocumentProvider), name))
            Registrations.GetValue(monitor.Get(name), AddTransformers);
    }

    private static object AddTransformers(OpenApiOptions options)
    {
        options.AddSchemaTransformer((schema, context, _) =>
        {
            if (schema.Type?.HasFlag(JsonSchemaType.Object) != true)
                return Task.CompletedTask;

            var name = context.JsonTypeInfo.Type.Name;
            var arity = name.IndexOf('`');
            if (arity >= 0)
                name = name[..arity];

            schema.Metadata ??= new Dictionary<string, object>();
            schema.Metadata[ClrNameExtension] = name;
            return Task.CompletedTask;
        });
        // FastEndpoints may clone schemas while rewriting request bodies.
        // Publish extensions after its operation transformers have run.
        options.AddDocumentTransformer((document, _, _) =>
        {
            new OpenApiWalker(new EntityNameVisitor()).Walk(document);
            return Task.CompletedTask;
        });
        return options;
    }

    private sealed class EntityNameVisitor : OpenApiVisitorBase
    {
        public override void Visit(IOpenApiSchema schema)
        {
            if (schema is not OpenApiSchema concrete ||
                concrete.Metadata?.TryGetValue(ClrNameExtension, out var value) != true ||
                value is not string name)
                return;

            concrete.Extensions ??= new Dictionary<string, IOpenApiExtension>();
            concrete.Extensions.TryAdd(ClrNameExtension, new JsonNodeExtension(JsonValue.Create(name)!));
        }
    }
}
