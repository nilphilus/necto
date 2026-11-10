namespace SampleApi.FastEndpoints.Weather;

public sealed record WeatherLocation(int Id, string City)
{
    internal static IReadOnlyList<WeatherLocation> Samples { get; } =
        [new(1, "Warsaw"), new(2, "Gdańsk")];
}
