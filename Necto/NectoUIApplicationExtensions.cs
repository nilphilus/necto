using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.StaticFiles;

namespace Necto;

public static class NectoUIApplicationExtensions
{
    private static readonly string[] ReadMethods = [HttpMethods.Get, HttpMethods.Head];
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    /// <summary>Serves the embedded Necto UI for an OpenAPI JSON document.</summary>
    /// <param name="app">The application serving Necto UI.</param>
    /// <param name="routePrefix">The UI path, relative to the application's path base.</param>
    /// <param name="openApiPath">The OpenAPI JSON path, relative to the application's path base.</param>
    /// <param name="agentPath">Optional path registered using MapNectoAgent.</param>
    /// <param name="endpointMappingsPath">The optional endpoint mappings JSON path.</param>
    public static WebApplication UseNectoUI(
        this WebApplication app,
        string routePrefix = "/necto",
        string openApiPath = "/openapi/v1.json",
        string? endpointMappingsPath = null,
        string? agentPath = null)
    {
        app.MapNectoUI(routePrefix, openApiPath, endpointMappingsPath, agentPath);
        return app;
    }

    /// <summary>Maps the embedded Necto UI and returns its group for endpoint conventions.</summary>
    /// <param name="app">The application serving Necto UI.</param>
    /// <param name="routePrefix">The UI path, relative to the application's path base.</param>
    /// <param name="openApiPath">The OpenAPI JSON path, relative to the application's path base.</param>
    /// <param name="endpointMappingsPath">The optional endpoint mappings JSON path.</param>
    /// <param name="agentPath">Optional path registered using MapNectoAgent.</param>
    public static RouteGroupBuilder MapNectoUI(
        this WebApplication app,
        string routePrefix = "/necto",
        string openApiPath = "/openapi/v1.json",
        string? endpointMappingsPath = null,
        string? agentPath = null)
    {
        ArgumentNullException.ThrowIfNull(app);
        ValidatePath(routePrefix, nameof(routePrefix));
        ValidatePath(openApiPath, nameof(openApiPath));
        if (endpointMappingsPath is not null)
            ValidatePath(endpointMappingsPath, nameof(endpointMappingsPath));

        if (agentPath is not null) ValidatePath(agentPath, nameof(agentPath));

        var uiPath = routePrefix.TrimEnd('/');
        if (uiPath.Length == 0)
        {
            throw new ArgumentException("The UI requires a non-root route prefix.", nameof(routePrefix));
        }

        var openApi = new PathString(openApiPath);
        var ui = app.MapGroup(uiPath).ExcludeFromDescription();

        ui.MapMethods("", ReadMethods, (HttpContext context) =>
        {
            if (!context.Request.Path.Value!.EndsWith('/'))
            {
                var location = context.Request.PathBase.Add(context.Request.Path).ToUriComponent();
                return Results.LocalRedirect(location + "/" + context.Request.QueryString);
            }

            return ServeIndex(context, uiPath);
        });

        foreach (var route in new[] { "/api", "/api/endpoint/{operation}", "/scenarios",
            "/scenarios/{id}/steps/{step:int}", "/entities", "/endpoints", "/agent", "/oauth-callback" })
        {
            ui.MapMethods(route, ReadMethods, (HttpContext context) => ServeIndex(context, uiPath));
        }

        ui.MapMethods("/configuration", ReadMethods, (HttpContext context) =>
        {
            var configuration = new Dictionary<string, string>
            {
                ["openApiUrl"] = context.Request.PathBase.Add(openApi).ToUriComponent(),
                ["apiBaseUrl"] = context.Request.PathBase.ToUriComponent() + "/"
            };
            if (endpointMappingsPath is not null)
                configuration["endpointMappingsUrl"] = context.Request.PathBase.Add(endpointMappingsPath).ToUriComponent();
            if (agentPath is not null)
                configuration["agentUrl"] = context.Request.PathBase.Add(agentPath).ToUriComponent();
            return Results.Json(configuration, JsonSerializerOptions.Web);
        });
        ui.MapMethods("/assets/{assetName}", ReadMethods, (string assetName) => ServeAsset("assets/" + assetName));

        return ui;
    }

    private static IResult ServeIndex(HttpContext context, string uiPath)
    {
        using var stream = typeof(NectoUIApplicationExtensions).Assembly.GetManifestResourceStream("Necto.UI/index.html")!;
        using var reader = new StreamReader(stream);
        var baseUrl = context.Request.PathBase.Add(new PathString(uiPath)).ToUriComponent() + "/";
        var html = reader.ReadToEnd().Replace("<base href=\"/\">", $"<base href=\"{HtmlEncoder.Default.Encode(baseUrl)}\">", StringComparison.Ordinal);
        return Results.Content(html, "text/html; charset=utf-8");
    }

    private static IResult ServeAsset(string assetPath)
    {
        var resourceName = "Necto.UI/" + assetPath;
        var stream = typeof(NectoUIApplicationExtensions).Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return Results.NotFound();
        }

        ContentTypes.TryGetContentType(assetPath, out var contentType);
        return Results.File(stream, contentType ?? "application/octet-stream");
    }

    private static void ValidatePath(string path, string parameterName)
    {
        ArgumentException.ThrowIfNullOrEmpty(path, parameterName);
        if (!path.StartsWith('/') || path.StartsWith("//", StringComparison.Ordinal) ||
            path.AsSpan().ContainsAny('?', '#', '\\'))
        {
            throw new ArgumentException("Use an application-relative path starting with '/'.", parameterName);
        }
    }
}
