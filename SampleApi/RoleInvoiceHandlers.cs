using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Necto;
public static class RoleInvoiceHandlers
{
    [NectoOperation(typeof(RoleInvoice), NectoOperationRole.Create, EntityName="Invoice draft", Description="Prepare the request body, review it and explicitly send to create a draft.")]
    public static Created<RoleInvoice> Create([FromBody] RoleInvoice request)=>TypedResults.Created("/role-invoices/1",request);
}
public sealed record RoleInvoice(int Id,string Reference);
