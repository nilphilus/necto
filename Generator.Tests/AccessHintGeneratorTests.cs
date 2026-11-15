using Necto.Generator;
public sealed class AccessHintGeneratorTests
{
    [Fact] public void CompilesNamedPoliciesAndRoleAlternativesWithoutGeneratingEnforcement()
    {
        var result=ContractGeneratorFixture.Generate(new AccessHintsGenerator(),"""
            app.MapGet("/x",Handler.Read).WithName("Read");
            static class Handler { [Microsoft.AspNetCore.Authorization.Authorize("Invoices.Read",Roles="Reader,Admin")] public static int Read()=>42; }
            """);
        var text=result.GeneratedTrees.Single().ToString();Assert.Contains("Invoices.Read",text);Assert.Contains("Reader,Admin",text);Assert.DoesNotContain("RequireAuthorization",text);
    }
}
