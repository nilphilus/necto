using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;
public sealed class OperationRolesTests:IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public OperationRolesTests(WebApplicationFactory<Program> factory)=>client=factory.CreateClient();
    [Fact]
    public async Task OnlyAuthorDeclaredRolesArePublishedForLambdasAndMethods()
    {
        var roles=(await client.GetFromJsonAsync<NectoOperationPurpose[]>("/necto/operation-roles"))!;
        Assert.Contains(roles,role=>role.OperationId=="Invoices"&&role.Role=="Search"&&role.EntityName=="Invoice");
        Assert.Contains(roles,role=>role.OperationId=="CreateRoleInvoice"&&role.Role=="Create"&&role.EntityName=="Invoice draft"&&role.Description!.Contains("explicitly"));
        Assert.DoesNotContain(roles,role=>role.OperationId=="GetWeatherForecast");
        var config=await client.GetFromJsonAsync<Dictionary<string, JsonElement>>("/necto/configuration");
        Assert.Equal("/necto/operation-roles",config!["operationRolesUrl"].GetString());
    }
}
