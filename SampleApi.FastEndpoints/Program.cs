using FastEndpoints;
using FastEndpoints.OpenApi;
using Necto;
using SampleApi.FastEndpoints;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddFastEndpoints().OpenApiDocument(options =>
{
    options.Title = "SampleApi.FastEndpoints";
    options.AutoTagPathSegmentIndex = 0;
});

var app = builder.Build();
app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    const string mappingsPath = "/necto/endpoint-mappings";
    app.MapGet(mappingsPath, SampleEndpointMappings.Create).ExcludeFromDescription();
    app.UseNectoUI(endpointMappingsPath: mappingsPath);
}

app.Run();
