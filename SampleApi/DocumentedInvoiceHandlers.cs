using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;

public static class DocumentedInvoiceHandlers
{
    /// <summary>Create an invoice from documented source code.</summary>
    /// <remarks>Choose a **customer** before creating the invoice.</remarks>
    /// <param name="request">The invoice draft to create.</param>
    public static Ok<DocumentedInvoice> Create([FromBody] DocumentedInvoice request)=>TypedResults.Ok(request);
}
/// <summary>An invoice described in source XML comments.</summary>
public sealed class DocumentedInvoice
{
    /// <summary>The external invoice reference.</summary>
    [JsonPropertyName("invoice-reference")]
    public string Reference {get;set;}="";
}
