using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Necto;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapNectoEndpointMappings();
    app.UseNectoUI(endpointMappingsPath: "/necto/endpoint-mappings");
}

app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast")
.WithTags("Weather")
.WithSummary("Weather forecast")
.WithDescription("Get a five-day forecast with daily temperatures.");

app.MapGet("/invoices", () => new[] { new Invoice(42, 210.00m, 781) })
    .WithName("Invoices")
    .WithTags("Invoices")
    .WithSummary("Invoices")
    .WithDescription("List invoices with their totals and reference numbers.");

app.MapGet("/invoices/{invoiceId:int}/lines", (int invoiceId) =>
        new[] { new InvoiceLine(invoiceId, "Consulting") })
    .WithName("InvoiceLines")
    .WithTags("Invoices")
    .WithSummary("Invoice lines")
    .WithDescription("List the line items for a given invoice ID.");

app.MapGet("/invoices/by-legacy-number", ([EndpointValue("LegacyInvoice")] int number) =>
        new Invoice(42, 210.00m, number))
    .WithName("InvoiceByLegacyNumber")
    .WithTags("Invoices")
    .WithSummary("Invoice by legacy number")
    .WithDescription("Find an invoice using its number in the legacy system.");

app.MapGet("/customers", () => TypedResults.Ok(new[] { new Customer(new CustomerId(7), "Contoso") }))
    .WithName("Customers")
    .WithTags("Customers")
    .WithSummary("Customers")
    .WithDescription("List customers with their IDs and names.");

app.MapPost("/customers/search", ([FromBody] CustomerSearch search) =>
        new Customer(search.SelectedCustomer, "Contoso"))
    .WithName("FindCustomer")
    .WithTags("Customers")
    .WithSummary("Find customer")
    .WithDescription("Find a customer by the ID supplied in the JSON body.")
    .AddOpenApiOperationTransformer((operation, _, _) =>
    {
        if (operation.RequestBody?.Content?.TryGetValue("application/json", out var json) == true)
            json.Example = JsonNode.Parse("""{"selectedCustomer":{"value":7}}""");

        return Task.CompletedTask;
    });

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

record Invoice(int Id, decimal Total, [property: EndpointValue("LegacyInvoice")] int LegacyNumber);
record InvoiceLine(int InvoiceId, string Description);
record struct CustomerId(int Value);
record Customer(CustomerId Id, string Name);
record CustomerSearch(CustomerId SelectedCustomer);

public partial class Program;
