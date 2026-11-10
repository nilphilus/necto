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
.WithName("GetWeatherForecast");

app.MapGet("/invoices", () => new[] { new Invoice(42, 210.00m, 781) })
    .WithName("Invoices");

app.MapGet("/invoices/{invoiceId:int}/lines", (int invoiceId) =>
        new[] { new InvoiceLine(invoiceId, "Consulting") })
    .WithName("InvoiceLines");

app.MapGet("/invoices/by-legacy-number", ([EndpointValue("LegacyInvoice")] int number) =>
        new Invoice(42, 210.00m, number))
    .WithName("InvoiceByLegacyNumber");

app.MapGet("/customers", () => TypedResults.Ok(new[] { new Customer(new CustomerId(7), "Contoso") }))
    .WithName("Customers");

app.MapPost("/customers/search", ([FromBody] CustomerSearch search) =>
        new Customer(search.SelectedCustomer, "Contoso"))
    .WithName("FindCustomer");

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
