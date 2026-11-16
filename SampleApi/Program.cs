using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http.HttpResults;
using Necto;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi(options => options.AddNectoGeneratedDocumentation());

builder.Services.Configure<Microsoft.AspNetCore.OpenApi.OpenApiOptions>("v1", options => options.AddNectoGeneratedLinks());
builder.Services.Configure<Microsoft.AspNetCore.OpenApi.OpenApiOptions>("v1", options => options.AddNectoGeneratedWrappers());
builder.Services.Configure<Microsoft.AspNetCore.OpenApi.OpenApiOptions>("v1", options => options.AddNectoGeneratedConstraints());
var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
    app.MapNectoEntityCatalog();
    app.MapNectoAgent();
    app.MapNectoOperationRoles();
    app.UseNectoUI(agentPath: "/necto/agent");
}

app.UseHttpsRedirection();
app.MapPost("/documented-invoices", DocumentedInvoiceHandlers.Create).WithName("CreateDocumentedInvoice");
app.MapPost("/documented-invoices/authored", DocumentedInvoiceHandlers.Create).WithName("AuthoredDocumentedInvoice")
    .WithSummary("Authored summary").WithDescription("Authored description");

Invoice[] invoices = Enumerable.Range(42, 12)
    .Select(id => new Invoice(id, 0m, 781 + id - 42, $"INV-{id}")).ToArray();
InvoiceLineSample[] invoiceLines =
[
    new(17, 42, "Consulting", 2, 117, 75m, "PLN"),
    new(18, 42, "Support", 1, 118, 60m, "PLN")
];
invoiceLines = invoiceLines.Concat(Enumerable.Range(19, 10)
    .Select(id => new InvoiceLineSample(id, 42, $"Service item {id}", 1, id + 100, 30m, "PLN")))
    .Concat(invoices.Skip(1).SelectMany(invoice => Enumerable.Range(1, 6)
        .Select(index => new InvoiceLineSample(invoice.Id * 100 + index, invoice.Id,
            $"Invoice {invoice.Id} service {index}", index, invoice.Id * 1000 + index, 30m, "PLN"))))
    .ToArray();

invoices = invoices.Select(invoice => invoice with
{
    Total = invoiceLines.Where(line => line.InvoiceId == invoice.Id).Sum(line => line.Quantity * line.UnitPrice)
}).ToArray();

// XML previews: a whole document and an XML string carried inside a mapped JSON object.
app.MapGet("/invoices/xml-preview", (int count = 1200) =>
    {
        var xml = new System.Xml.Linq.XElement("invoices",
            Enumerable.Range(100000, Math.Clamp(count, 1, 10000)).Select(id =>
                new System.Xml.Linq.XElement("invoice", new System.Xml.Linq.XAttribute("id", id),
                    new System.Xml.Linq.XElement("reference", $"INV-{id}"),
                    new System.Xml.Linq.XElement("total", new System.Xml.Linq.XAttribute("currency", "PLN"), 125.00m))));
        return TypedResults.Text(xml.ToString(), "application/xml");
    })
    .WithName("InvoiceXmlPreview")
    .WithTags("Invoices")
    .WithSummary("XML invoice collection")
    .WithDescription("Synthetic XML collection for Preview pagination. count controls 1–10,000 invoices.")
    .Produces<string>(StatusCodes.Status200OK, "application/xml");

app.MapGet("/invoices/{invoiceId:int}/xml-document", Results<Ok<InvoiceXmlPayload>, NotFound> (int invoiceId) =>
    {
        if (invoices.FirstOrDefault(invoice => invoice.Id == invoiceId) is not { } invoice)
            return TypedResults.NotFound();
        var xml = new System.Xml.Linq.XElement("invoice", new System.Xml.Linq.XAttribute("id", invoice.Id),
            new System.Xml.Linq.XElement("reference", invoice.Reference),
            new System.Xml.Linq.XElement("total", new System.Xml.Linq.XAttribute("currency", "PLN"), invoice.Total));
        return TypedResults.Ok(new InvoiceXmlPayload(invoice.Id, invoice.Reference, xml.ToString()));
    })
    .WithName("InvoiceXmlDocument")
    .WithTags("Invoices")
    .WithSummary("Invoice with an embedded XML document")
    .WithDescription("Open XML preview beside document. The surrounding JSON object remains selectable for related requests.");

app.MapGet("/invoices/wrapped", () => new PagedResult<Invoice>(invoices, 500)).WithName("WrappedInvoices").WithTags("Invoices");
app.MapPost("/invoices/constrained", ([FromBody] ConstrainedInvoice invoice) => TypedResults.Ok(invoice)).WithName("ConstrainedInvoice").WithTags("Invoices");
app.MapGet("/invoices/related-model", () => new RelatedInvoice(42, new CustomerId(17))).WithName("RelatedInvoice").WithTags("Invoices");

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

app.MapGet("/invoices/large-payload", (int count = 10000, int noteSize = 512) =>
    {
        count = Math.Clamp(count, 1, 200000);
        noteSize = Math.Clamp(noteSize, 0, 1024);
        var notes = new string('x', noteSize);
        return Enumerable.Range(100000, count)
            .Select(id => new LargeInvoiceLine(id, 42, $"Bulk service {id}", notes,
                new InvoiceLineMetadata("PLN", ["service", "bulk", "preview"]))).ToArray();
    })
    .WithName("LargeInvoiceLines")
    .WithTags("Invoices")
    .WithSummary("Large invoice payload")
    .WithDescription("One response, no API paging. Up to 200,000 items; noteSize controls characters per item. Try count=100000 and noteSize=1024 for a payload above 100 MB.");

app.MapGet("/invoices/large-lines/{lineId:int}", (int lineId) =>
        new LargeInvoiceLine(lineId, 42, $"Bulk service {lineId}", "Detail response",
            new InvoiceLineMetadata("PLN", ["service", "bulk", "preview"])))
    .WithName("LargeInvoiceLine")
    .WithTags("Invoices")
    .WithSummary("Large invoice line");

app.MapGet("/invoices/preview", () => new InvoicePreview(
        invoiceLines.Where(line => line.InvoiceId == 42)
            .Select(line => new InvoiceLine(line.LineId, line.InvoiceId, line.Description)).ToArray()))
    .WithName("InvoicePreview")
    .WithTags("Invoices")
    .WithSummary("Nested invoice lines preview");

app.MapGet("/invoices", [NectoOperation(typeof(Invoice), NectoOperationRole.Search, Description = "Find invoices before opening their related records.")] ([FromQuery] string? reference) => reference is null
        ? invoices
        : invoices.Where(invoice => invoice.Reference == reference).ToArray())
    .WithName("Invoices")
    .WithTags("Invoices")
    .WithSummary("Invoices")
    .WithDescription("List invoices with their totals and optionally filter by reference.");

app.MapGet("/invoices/by-reference", Results<Ok<Invoice>, NotFound> ([FromQuery] string invoiceReference) =>
        invoices.FirstOrDefault(invoice => invoice.Reference == invoiceReference) is { } invoice
            ? TypedResults.Ok(invoice)
            : TypedResults.NotFound())
    .WithName("InvoiceByReference")
    .WithTags("Invoices")
    .WithSummary("Invoice by reference")
    .WithDescription("Find an invoice using its reference.");

app.MapGet("/invoices/{invoiceId:int}/lines", Results<Ok<InvoiceLine[]>, NotFound> (int invoiceId) =>
        invoices.Any(invoice => invoice.Id == invoiceId)
            ? TypedResults.Ok(invoiceLines.Where(line => line.InvoiceId == invoiceId)
                .Select(line => new InvoiceLine(line.LineId, line.InvoiceId, line.Description)).ToArray())
            : TypedResults.NotFound())
    .WithName("InvoiceLines")
    .WithTags("Invoices")
    .WithSummary("Invoice lines")
    .WithDescription("List the line items for a given invoice ID.");

app.MapGet("/invoices/lines/{lineId:int}", Results<Ok<InvoiceLineItem>, NotFound> (int lineId) =>
        invoiceLines.FirstOrDefault(line => line.LineId == lineId) is { } line
            ? TypedResults.Ok(new InvoiceLineItem(line.LineId, line.Description, line.Quantity, line.DetailId))
            : TypedResults.NotFound())
    .WithName("InvoiceLine")
    .WithTags("Invoices")
    .WithSummary("Invoice line")
    .WithDescription("Get one line item and the ID of its pricing details.");

app.MapGet("/invoices/line-details/{detailId:int}", Results<Ok<InvoiceLineDetails>, NotFound> (int detailId) =>
        invoiceLines.FirstOrDefault(line => line.DetailId == detailId) is { } line
            ? TypedResults.Ok(new InvoiceLineDetails(line.LineId, line.Quantity, line.UnitPrice, line.Currency))
            : TypedResults.NotFound())
    .WithName("InvoiceLineDetails")
    .WithTags("Invoices")
    .WithSummary("Invoice line details")
    .WithDescription("Get unit price, quantity, net amount and currency for a line item.");

app.MapGet("/invoices/by-legacy-number", ([EndpointValue("LegacyInvoice")] int number) =>
        invoices.FirstOrDefault(invoice => invoice.LegacyNumber == number))
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

app.MapPost("/role-invoices", RoleInvoiceHandlers.Create).WithName("CreateRoleInvoice");
app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

record Invoice(int Id, decimal Total, [property: EndpointValue("LegacyInvoice")] int LegacyNumber, string Reference);
record InvoiceLineSample(int LineId, int InvoiceId, string Description, int Quantity, int DetailId, decimal UnitPrice, string Currency);
record InvoiceLineMetadata(string Currency, string[] Labels);
record LargeInvoiceLine(int LineId, int InvoiceId, string Description, string Notes, InvoiceLineMetadata Metadata);
record InvoicePreview([property: System.Text.Json.Serialization.JsonPropertyName("invoice-lines")] InvoiceLine[] Lines);
record InvoiceLine(int LineId, int InvoiceId, string Description);
record InvoiceLineItem(int LineId, string Description, int Quantity, int DetailId);
record InvoiceLineDetails(int LineId, int Quantity, decimal UnitPrice, string Currency)
{
    public decimal NetAmount => Quantity * UnitPrice;
}
record struct CustomerId(int Value);
record Customer(CustomerId Id, string Name);
record CustomerSearch(CustomerId SelectedCustomer);

public partial class Program;

record InvoiceXmlPayload([property: EndpointValue("invoiceId")] int Id, string Reference, string Document);

record PagedResult<T>([property: System.Text.Json.Serialization.JsonPropertyName("items")] T[] Items, int TotalCount);
record ConstrainedInvoice([property: System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.StringLength(32, MinimumLength = 3)] string Reference, [property: System.ComponentModel.DataAnnotations.Range(1, 10000)] int Quantity);
record RelatedInvoice(int Id, [property: NectoRelation(typeof(Customer))] CustomerId CustomerId);
