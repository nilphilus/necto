using FastEndpoints;
using FastEndpoints.OpenApi;
using Necto;
using SampleApi.FastEndpoints;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<TenantDirectory>();
builder.Services.AddFastEndpoints().OpenApiDocument(options =>
{
    options.Title = "SampleApi.FastEndpoints";
    options.ShortSchemaNames = true;
    options.AutoTagPathSegmentIndex = 0;
});

var app = builder.Build();
app.UseRouting();
app.Use((context, next) => context.RequestServices.GetRequiredService<TenantDirectory>().SelectAsync(context, next));
app.UseFastEndpoints(options =>
{
    options.Endpoints.ShortNames = true;
    options.Endpoints.Configurator = endpoint => endpoint.Options(builder => builder
        .WithMetadata(new TenantRequired())
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status404NotFound));
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapNectoEntityCatalog();
    app.UseNectoUI();
}

app.Run();
