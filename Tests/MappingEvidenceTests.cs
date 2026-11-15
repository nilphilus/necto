using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Necto;
public sealed class MappingEvidenceTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public MappingEvidenceTests(WebApplicationFactory<Program> factory) => client = factory.CreateClient();
    [Fact]
    public async Task GeneratorPublishesEvidenceForEveryMatchingRule()
    {
        var mappings = (await client.GetFromJsonAsync<EndpointMapping[]>("/necto/endpoint-mappings"))!;
        foreach (var rule in new[] { "type", "attribute", "name" })
        {
            var mapping = mappings.First(item => item.Match == rule);
            Assert.NotNull(mapping.Evidence);
            Assert.Equal(mapping.Evidence.SourceType, mapping.Evidence.TargetType);
            if (rule == "attribute") Assert.False(string.IsNullOrWhiteSpace(mapping.Evidence.LogicalKey));
        }
    }
}
