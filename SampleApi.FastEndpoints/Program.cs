using FastEndpoints;
using FastEndpoints.OpenApi;
using Necto;
using SampleApi.FastEndpoints;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddFastEndpoints().OpenApiDocument(options =>
{
    options.Title = "SampleApi.FastEndpoints";
    options.ShortSchemaNames = true;
    options.AutoTagPathSegmentIndex = 0;
});

var app = builder.Build();
app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
    const string mappingsPath = "/necto/endpoint-mappings";
    app.MapGet(mappingsPath, SampleEndpointMappings.Create).ExcludeFromDescription();
    app.UseNectoUI(endpointMappingsPath: mappingsPath);
}

app.Run();
